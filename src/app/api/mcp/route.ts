// /api/mcp — Streamable HTTP transport for the Model Context Protocol.
//
// Implements the wire shape Claude Desktop / Cursor / mcp-inspector expect
// (per MCP spec 2024-11-05 + 2025-03-26):
//   • POST /api/mcp — one JSON-RPC message in, one out.
//       - Notifications (no id)        → 202 Accepted, empty body
//       - Requests with Accept: SSE    → text/event-stream with the response
//                                         delivered as a single `message` event
//       - Requests with Accept: JSON   → application/json single response
//       - On `initialize`, the response carries `Mcp-Session-Id` header
//   • GET  /api/mcp — opens a long-lived SSE stream the server uses to push
//       notifications (idle keep-alive for now; the channel exists so MCP
//       clients that REQUIRE it can connect).
//   • DELETE /api/mcp — terminates a session (204 No Content).
//
// Auth is by API key (mint at /developer). Bearer token in Authorization
// header gates every method except `initialize`.

import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

import { db, agents, type NewAgent } from "@/lib/db";
import { resolveCaller } from "@/lib/interlock/auth";
import type { SuccessCriterion } from "@/lib/interlock/dsl";
import type { LifecycleCostItem } from "@/lib/interlock/lifecycle";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── Protocol constants ─────────────────────────────────────────────────────

const SERVER_INFO = { name: "interlock", version: "0.1.0" };
const SUPPORTED_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26"];
const DEFAULT_PROTOCOL_VERSION = "2025-03-26";
const SERVER_INSTRUCTIONS =
  "Interlock is an outcome-settlement platform on Sui. Agents register with `register_agent` to appear in the marketplace; clients hire them, and `start_workflow` runs the full quote → escrow → execution → verifier → on-chain settle cycle. Costs are escrowed in SUI and split atomically across the agent company, model/tool providers, and the platform fee.";

// ─── Types ──────────────────────────────────────────────────────────────────

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse<T = unknown> =
  | { jsonrpc: "2.0"; id: string | number | null; result: T }
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      error: { code: number; message: string; data?: unknown };
    };

// ─── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "register_agent",
    description:
      "Register the calling agent in the Interlock marketplace so clients can hire it. Returns the agent's slug and detail URL.",
    inputSchema: {
      type: "object",
      required: ["name", "description", "priceBaseUnits"],
      properties: {
        name: { type: "string" },
        slug: { type: "string", description: "URL slug. Auto-generated from name if omitted." },
        description: { type: "string" },
        taskTags: { type: "array", items: { type: "string" } },
        workflowSpec: {
          type: "object",
          properties: {
            steps: {
              type: "array",
              items: {
                type: "object",
                required: ["kind", "label"],
                properties: {
                  kind: { type: "string", enum: ["model_call", "tool_call", "human_review", "compute"] },
                  label: { type: "string" },
                  provider: { type: "string" },
                  costNote: { type: "string" },
                },
              },
            },
          },
        },
        criteriaTemplate: { description: "Success-criteria DSL frozen into every Quote you fulfill." },
        exampleOutcome: { type: "object", description: "Outcome JSON that satisfies your own criteria — used to pre-fill hire forms." },
        pricingModel: { type: "string", default: "fixed" },
        priceBaseUnits: { type: "number", description: "Default escrow price in coin base units (1 SUI = 1e9)." },
      },
    },
  },
  {
    name: "start_workflow",
    description:
      "Run a full Interlock workflow lifecycle (quote → escrow → execution → verify → settle) and return the resulting workflow + settlement IDs.",
    inputSchema: {
      type: "object",
      properties: {
        priceBaseUnits: { type: "number" },
        criteria: { description: "Success-criteria DSL." },
        outcome: { type: "object", description: "Agent's claimed outcome JSON." },
        costItems: { type: "array" },
        disputeWindowSeconds: { type: "number", default: 10 },
        agentId: { type: "number", description: "Tag the resulting workflow with this agent's marketplace ID." },
      },
    },
  },
] as const;

// ─── Tool implementations ───────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

async function callRegisterAgent(
  args: Record<string, unknown>,
  ownerAddress: string,
): Promise<unknown> {
  const name = String(args.name ?? "");
  const description = String(args.description ?? "");
  const priceBaseUnits = Number(args.priceBaseUnits ?? 0);
  if (!name || name.length < 2) throw new Error("name required (min 2 chars)");
  if (!description || description.length < 10) throw new Error("description required");
  if (!priceBaseUnits || priceBaseUnits < 1) throw new Error("priceBaseUnits required");

  const slug =
    (typeof args.slug === "string" && slugify(args.slug)) ||
    slugify(name) ||
    `agent-${Date.now()}`;
  const now = Date.now();
  const record: NewAgent = {
    ownerAddress,
    slug,
    name,
    description,
    taskTags: Array.isArray(args.taskTags) ? (args.taskTags as string[]) : [],
    workflowSpec: (args.workflowSpec as NewAgent["workflowSpec"]) ?? { steps: [] },
    criteriaTemplate: args.criteriaTemplate ?? {},
    exampleOutcome:
      (args.exampleOutcome as Record<string, unknown> | undefined) ?? {},
    pricingModel: typeof args.pricingModel === "string" ? args.pricingModel : "fixed",
    priceBaseUnits,
    status: "active",
    createdAtMs: now,
    updatedAtMs: now,
  };
  const [inserted] = await db().insert(agents).values(record).returning();
  return {
    agentId: inserted.id,
    slug: inserted.slug,
    detailUrl: `/agents/${inserted.slug}`,
    message: `Registered '${inserted.name}'. Clients can hire you at /agents/${inserted.slug}.`,
  };
}

/** Stage labels — used for the `notifications/progress.message` field. */
const STAGE_TOTAL = 7;
const STAGE_NUMBER: Record<string, number> = {
  quote: 1,
  workflow: 2,
  execution: 3,
  verify: 4,
  outcome: 5,
  dispute_window: 6,
  settle: 7,
};

/**
 * Drive a workflow end-to-end via /api/workflows/start. Returns the final
 * structured result. When `onProgress` is supplied it's invoked for each
 * stage event so the caller can forward MCP `notifications/progress` to the
 * client in real time.
 */
async function callStartWorkflow(
  args: Record<string, unknown>,
  baseUrl: string,
  authHeader: string,
  onProgress?: (data: { progress: number; total: number; message: string }) => void,
): Promise<unknown> {
  const resp = await fetch(`${baseUrl}/api/workflows/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      priceBaseUnits: args.priceBaseUnits as number | undefined,
      criteria: args.criteria as SuccessCriterion | undefined,
      outcome: args.outcome as Record<string, unknown> | undefined,
      costItems: args.costItems as LifecycleCostItem[] | undefined,
      disputeWindowSeconds: args.disputeWindowSeconds as number | undefined,
      agentId: args.agentId as number | undefined,
    }),
  });
  if (!resp.body) throw new Error("no response body");
  if (!resp.ok) throw new Error(`start_workflow ${resp.status}: ${await resp.text()}`);

  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let complete: Record<string, unknown> | null = null;
  let errorMsg: string | null = null;
  let stageCount = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        const ev = JSON.parse(line) as { event: string; data: Record<string, unknown> };
        if (ev.event === "stage") {
          stageCount += 1;
          const stageName = ev.data.stage as string;
          const status = ev.data.status as string;
          const n = STAGE_NUMBER[stageName] ?? 0;
          if (onProgress) {
            const refunded = (ev.data.refunded as boolean | undefined) ?? false;
            const displayName = stageName === "settle" && refunded ? "refund" : stageName;
            onProgress({
              progress: n,
              total: STAGE_TOTAL,
              message: `${displayName} ${status}`,
            });
          }
        }
        if (ev.event === "complete") complete = ev.data;
        else if (ev.event === "error") errorMsg = ev.data.message as string;
      }
      nl = buf.indexOf("\n");
    }
  }
  if (errorMsg) throw new Error(errorMsg);
  return {
    ...complete,
    stageCount,
    message:
      "Workflow completed end-to-end. See workflowExplorer / settlementExplorer for Suiscan links.",
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rpcResult<T>(id: JsonRpcRequest["id"], result: T): JsonRpcResponse<T> {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

function negotiateProtocolVersion(requested?: string): string {
  if (requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) return requested;
  return DEFAULT_PROTOCOL_VERSION;
}

function generateSessionId(): string {
  return randomBytes(16).toString("hex");
}

function isNotification(msg: JsonRpcRequest): boolean {
  return msg.id === undefined || msg.id === null;
}

type ProgressNotification = {
  jsonrpc: "2.0";
  method: "notifications/progress";
  params: {
    progressToken: string | number;
    progress: number;
    total?: number;
    message?: string;
  };
};

/** Sink for in-flight events emitted during one RPC. JSON callers see only
 *  the final response; SSE callers get progress notifications in between. */
type EventSink = {
  progress?: (n: ProgressNotification) => void;
};

/** Dispatch one JSON-RPC message. Returns the response, or null when the
 *  message was a notification (notifications never carry responses). */
async function dispatch(
  msg: JsonRpcRequest,
  req: NextRequest,
  sink?: EventSink,
): Promise<JsonRpcResponse | null> {
  if (msg.jsonrpc !== "2.0" || !msg.method) {
    return rpcError(msg.id ?? null, -32600, "invalid request");
  }

  // Notifications — no response. Currently we just acknowledge by returning null.
  if (isNotification(msg)) {
    // notifications/initialized, notifications/cancelled, etc — no-op.
    return null;
  }

  // ── initialize ── no auth required (handshake before tools are known).
  if (msg.method === "initialize") {
    const params = (msg.params ?? {}) as {
      protocolVersion?: string;
      capabilities?: unknown;
      clientInfo?: { name?: string; version?: string };
    };
    return rpcResult(msg.id, {
      protocolVersion: negotiateProtocolVersion(params.protocolVersion),
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: SERVER_INSTRUCTIONS,
    });
  }

  // ── ping ── liveness check; no auth needed.
  if (msg.method === "ping") {
    return rpcResult(msg.id, {});
  }

  // Everything else requires auth.
  const caller = await resolveCaller(req);
  if (!caller) {
    return rpcError(
      msg.id,
      -32001,
      "unauthorized — mint an API key at /developer and set it as Authorization: Bearer wos_…",
    );
  }

  if (msg.method === "tools/list") {
    return rpcResult(msg.id, { tools: TOOLS });
  }

  if (msg.method === "tools/call") {
    const params = (msg.params ?? {}) as {
      name?: string;
      arguments?: Record<string, unknown>;
      _meta?: { progressToken?: string | number };
    };
    const name = params.name;
    const args = params.arguments ?? {};
    const progressToken = params._meta?.progressToken;
    try {
      if (name === "register_agent") {
        const result = await callRegisterAgent(args, caller.onChainAddress);
        return rpcResult(msg.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      }
      if (name === "start_workflow") {
        const auth = req.headers.get("authorization") ?? "";
        const baseUrl = new URL(req.url).origin;
        const onProgress =
          progressToken !== undefined && sink?.progress
            ? (data: { progress: number; total: number; message: string }) => {
                sink.progress!({
                  jsonrpc: "2.0",
                  method: "notifications/progress",
                  params: { progressToken, ...data },
                });
              }
            : undefined;
        const result = await callStartWorkflow(args, baseUrl, auth, onProgress);
        return rpcResult(msg.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        });
      }
      return rpcError(msg.id, -32601, `unknown tool: ${name}`);
    } catch (e) {
      return rpcError(msg.id, -32000, (e as Error).message);
    }
  }

  return rpcError(msg.id, -32601, `unknown method: ${msg.method}`);
}

// ─── Response encoders ──────────────────────────────────────────────────────

/** Render one JSON-RPC response as a Server-Sent Event `message` block. */
function sseFrame(response: JsonRpcResponse): string {
  const data = JSON.stringify(response);
  return `event: message\ndata: ${data}\n\n`;
}

function jsonResponse(payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Render one JSON-RPC notification as an SSE frame. */
function sseNotification(n: ProgressNotification): string {
  return `event: message\ndata: ${JSON.stringify(n)}\n\n`;
}

function sseSingleResponse(
  response: JsonRpcResponse,
  headers: Record<string, string> = {},
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(sseFrame(response)));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
      ...headers,
    },
  });
}

/** Stream `notifications/progress` while a tool runs, then deliver the final
 *  JSON-RPC response and close. Spec-correct shape for long-running tools. */
function sseStreamingResponse(
  msg: JsonRpcRequest,
  req: NextRequest,
  headers: Record<string, string> = {},
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let open = true;
      const safeEnqueue = (frame: string): void => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(frame));
        } catch {
          open = false;
        }
      };

      // Periodic SSE comment so proxies don't idle-close the connection
      // during the ~30-40s lifecycle.
      const keepAlive = setInterval(() => safeEnqueue(": keepalive\n\n"), 10_000);

      const sink: EventSink = {
        progress: (n) => safeEnqueue(sseNotification(n)),
      };

      try {
        const response = await dispatch(msg, req, sink);
        if (response) safeEnqueue(sseFrame(response));
      } catch (e) {
        safeEnqueue(
          sseFrame(rpcError(msg.id ?? null, -32000, (e as Error).message)),
        );
      } finally {
        clearInterval(keepAlive);
        open = false;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
      ...headers,
    },
  });
}

// ─── HTTP handlers ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  // Parse body.
  let body: unknown;
  try {
    body = await req.json();
  } catch (e) {
    return jsonResponse(rpcError(null, -32700, `parse error: ${(e as Error).message}`));
  }

  // We don't support batching (deprecated in MCP 2025-06-18); reject arrays.
  if (Array.isArray(body)) {
    return jsonResponse(rpcError(null, -32600, "batch requests not supported"));
  }
  const msg = body as JsonRpcRequest;

  // Notifications: 202 Accepted, no body. Short-circuit before we dispatch
  // anything (dispatch would return null but we want to avoid the work).
  if (isNotification(msg)) {
    return new Response(null, { status: 202 });
  }

  const accept = req.headers.get("accept") ?? "*/*";
  const wantsSSE = accept.includes("text/event-stream") && !accept.includes("application/json");

  // Build session-related headers up front so both branches set them.
  const extraHeaders: Record<string, string> = {};
  if (msg.method === "initialize") {
    extraHeaders["Mcp-Session-Id"] = generateSessionId();
    extraHeaders["MCP-Protocol-Version"] = DEFAULT_PROTOCOL_VERSION;
  }

  // For long-running tool calls with SSE, stream progress notifications +
  // the final response on the same connection. Anything else: synchronous.
  const isStreamableToolCall =
    wantsSSE &&
    msg.method === "tools/call" &&
    ((msg.params as { name?: string } | undefined)?.name === "start_workflow");

  if (isStreamableToolCall) {
    return sseStreamingResponse(msg, req, extraHeaders);
  }

  const response = await dispatch(msg, req);
  if (response === null) {
    return new Response(null, { status: 202 });
  }
  if (wantsSSE) {
    return sseSingleResponse(response, extraHeaders);
  }
  return jsonResponse(response, extraHeaders);
}

/**
 * GET /api/mcp — opens an SSE stream for server-initiated notifications.
 *
 * MCP clients that follow the Streamable HTTP transport (e.g. modern Claude
 * Desktop, Cursor's MCP client) MAY open this stream after `initialize` to
 * receive resource updates, progress events, etc. We don't push anything
 * yet; the stream just stays open with periodic keep-alive comments so the
 * connection survives proxies that idle-close.
 *
 * Clients that GET this URL without `Accept: text/event-stream` get a JSON
 * descriptor — handy for humans curling the endpoint to inspect tools.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const accept = req.headers.get("accept") ?? "";
  if (!accept.includes("text/event-stream")) {
    return jsonResponse({
      server: SERVER_INFO.name,
      version: SERVER_INFO.version,
      protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      transport: "streamable-http",
      endpoints: {
        rpc: "/api/mcp (POST)",
        notifications: "/api/mcp (GET, Accept: text/event-stream)",
        terminate: "/api/mcp (DELETE)",
      },
      auth: {
        type: "bearer",
        header: "Authorization",
        tokenPrefix: "wos_",
        mintAt: "/developer",
      },
      tools: TOOLS,
    });
  }

  // Stream open + idle keep-alive. Vercel will close after maxDuration; for
  // long-running clients on self-hosted, the loop continues until the client
  // disconnects.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      let open = true;
      controller.enqueue(enc.encode(": stream opened\n\n"));
      const ping = setInterval(() => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(": keepalive\n\n"));
        } catch {
          open = false;
          clearInterval(ping);
        }
      }, 15_000);
      // Close after just under maxDuration so we don't get a hard kill mid-frame.
      setTimeout(() => {
        open = false;
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }, 55_000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

/** DELETE /api/mcp — terminates the session. Stateless server: 204 always. */
export async function DELETE(): Promise<Response> {
  return new Response(null, { status: 204 });
}
