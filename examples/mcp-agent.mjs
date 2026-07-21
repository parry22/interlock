#!/usr/bin/env node
// End-to-end MCP agent demo for Interlock.
//
// Walks the full agent lifecycle the way Claude Desktop / Cursor / any
// MCP-capable runtime would:
//
//   1. initialize          (handshake, no auth)
//   2. tools/list          (discover register_agent + start_workflow)
//   3. tools/call register_agent  (list ourselves in the marketplace)
//   4. tools/call start_workflow  (run quote → escrow → execute → verify
//                                  → settle with live progress notifications)
//
// Usage:
//   INTERLOCK_API_KEY=wos_... node examples/mcp-agent.mjs [baseUrl]
//
// Default base URL: http://localhost:3000

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.INTERLOCK_API_KEY;

if (!KEY) {
  console.error("✗ set INTERLOCK_API_KEY (mint one at " + BASE + "/developer)");
  process.exit(1);
}

const ENDPOINT = `${BASE}/api/mcp`;
let sessionId = null;
let nextId = 1;

// ─── Transport ──────────────────────────────────────────────────────────────

async function rpc(method, params, { stream = false } = {}) {
  const id = nextId++;
  const body = { jsonrpc: "2.0", id, method, params };
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: stream ? "text/event-stream" : "application/json",
      Authorization: `Bearer ${KEY}`,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!sessionId && resp.headers.get("Mcp-Session-Id")) {
    sessionId = resp.headers.get("Mcp-Session-Id");
    console.log(`  ↳ session: ${sessionId.slice(0, 8)}…`);
  }
  if (!resp.ok && !stream) {
    throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  }
  if (!stream) {
    const json = await resp.json();
    if (json.error) throw new Error(`${method}: ${json.error.message}`);
    return json.result;
  }
  // SSE — parse `event: message\ndata: <json>\n\n` frames, deliver each as
  // it arrives. Returns the final result and emits progress notifications
  // via the global onProgress hook.
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let finalResult = null;
  let finalError = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let frameEnd;
    while ((frameEnd = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, frameEnd);
      buf = buf.slice(frameEnd + 2);
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const json = JSON.parse(dataLine.slice("data:".length).trim());
      if (json.method === "notifications/progress") {
        const p = json.params;
        process.stdout.write(`    [${p.progress}/${p.total}] ${p.message}\n`);
      } else if (json.error) {
        finalError = json.error;
      } else {
        finalResult = json.result;
      }
    }
  }
  if (finalError) throw new Error(finalError.message);
  return finalResult;
}

async function notify(method, params = {}) {
  // Notifications get 202; no body to parse.
  await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params }),
  });
}

// ─── Flow ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`▶ connecting to ${ENDPOINT}\n`);

  // 1. initialize
  console.log("1. initialize");
  const init = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "mcp-agent-demo", version: "1.0.0" },
  });
  console.log(`   ✓ server: ${init.serverInfo.name} v${init.serverInfo.version}`);
  console.log(`   ✓ protocol: ${init.protocolVersion}`);
  await notify("notifications/initialized");

  // 2. tools/list
  console.log("\n2. tools/list");
  const tools = await rpc("tools/list");
  console.log(`   ✓ ${tools.tools.length} tools available:`);
  for (const t of tools.tools) console.log(`     • ${t.name} — ${t.description.slice(0, 70)}…`);

  // 3. register_agent
  console.log("\n3. tools/call register_agent");
  const reg = await rpc("tools/call", {
    name: "register_agent",
    arguments: {
      name: "MCP Demo Agent " + new Date().toISOString().slice(0, 19),
      description:
        "Demonstration agent that the Interlock MCP example script registered automatically. Closes pretend tickets, charges 0.05 SUI per run.",
      taskTags: ["demo", "mcp", "support"],
      workflowSpec: {
        steps: [
          { kind: "model_call", label: "Read ticket", provider: "Claude Sonnet", costNote: "~2k tokens" },
          { kind: "tool_call", label: "Mark closed", provider: "zendesk.tickets.update", costNote: "1 API call" },
        ],
      },
      criteriaTemplate: { type: "exact", path: "/ticket_status", value: "closed" },
      exampleOutcome: { ticket_status: "closed" },
      pricingModel: "fixed",
      priceBaseUnits: 50_000_000,
    },
  });
  console.log(`   ✓ ${reg.structuredContent.message}`);
  const agentId = reg.structuredContent.agentId;

  // 4. start_workflow (streaming with progress notifications)
  console.log("\n4. tools/call start_workflow  (SSE — live stage progress)");
  const run = await rpc(
    "tools/call",
    {
      name: "start_workflow",
      arguments: {
        priceBaseUnits: 50_000_000,
        criteria: { type: "exact", path: "/ticket_status", value: "closed" },
        outcome: { ticket_status: "closed", ref: "demo" },
        disputeWindowSeconds: 5,
        agentId,
      },
      _meta: { progressToken: "demo-run-" + Date.now() },
    },
    { stream: true },
  );
  console.log(`\n   ✓ workflow:   ${run.structuredContent.workflowId}`);
  console.log(`   ✓ settlement: ${run.structuredContent.settlementId ?? "—  (refund branch)"}`);
  console.log(`\n   inspect: ${run.structuredContent.workflowExplorer}`);
  console.log(`            ${run.structuredContent.settlementExplorer}`);
}

main().catch((e) => {
  console.error("\n✗ failed:", e.message);
  process.exit(1);
});
