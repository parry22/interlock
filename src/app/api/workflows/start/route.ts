// POST /api/workflows/start — run a real agentic workflow, end to end.
//
// This is the entry point for both humans (the Create-Workflow form) and
// autonomous agents (API key + SDK). You describe the job's success criteria
// and price up front, the agent runs and reports its outcome + costs, the
// verifier signs a verdict, and the escrow settles atomically to all parties —
// or refunds you in full if the outcome doesn't meet the criteria.
//
// Body:
//   {
//     productId?:    number         (default: platform demo product)
//     priceBaseUnits?: number       USDC 6-decimals (default 10 USDC)
//     criteria?:     SuccessCriterion  what "success" means for this job
//     outcome?:      object            the agent's claimed output
//     costItems?:    Array<{ provider, category, units, amount }>
//     disputeWindowSeconds?: number (default 10)
//     agentId?:      number            marketplace attribution
//   }
//
// Auth: session cookie OR `Authorization: Bearer wos_…`. The workflow is
// created by, escrowed from, and refunded to the caller's OWN wallet.
//
// Response: NDJSON stream of {event, data} stage events.

import { NextRequest } from "next/server";
import { ethers } from "ethers";

import {
  type LifecycleCostItem,
  type VerifyResponse,
  createQuote,
  createWorkflow,
  recordExecution,
  settleWorkflowDev,
  submitAttestationDev,
  waitForDisputeWindow,
  explorerTxUrl,
  explorerAddressUrl,
  evmConfig,
} from "@/lib/interlock/lifecycle";
import { encodeCriteriaBytes, type SuccessCriterion } from "@/lib/interlock/dsl";
import { resolveCaller } from "@/lib/interlock/auth";
import { getUserWallet, getUserWalletByAddress, fundWalletIfNeeded } from "@/lib/interlock/wallets";
import { linkWorkflowToAgent, getAgentById } from "@/lib/db/agents";
import { runAgent } from "@/lib/interlock/agent-run";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

type StartBody = {
  productId?: number;
  priceBaseUnits?: number;
  criteria?: SuccessCriterion;
  /** Direct outcome (SDK mode — your agent already ran and produced this). */
  outcome?: Record<string, unknown>;
  costItems?: LifecycleCostItem[];
  disputeWindowSeconds?: number;
  /** When set, the platform RUNS this registered agent to produce the outcome. */
  agentId?: number;
  /** What the customer wants done — passed to the agent when it executes. */
  taskInput?: unknown;
};

export async function POST(req: NextRequest): Promise<Response> {
  const limited = rateLimit(req, "workflows-start", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  // === Auth ===
  const caller = await resolveCaller(req);
  if (!caller) {
    return Response.json(
      { error: "unauthorized — sign in or use Authorization: Bearer wos_…" },
      { status: 401 },
    );
  }

  let body: StartBody = {};
  try {
    body = (await req.json()) as StartBody;
  } catch {
    // Empty body is acceptable; defaults apply.
  }

  // If an agent is named, we run THAT agent: use its own product (so its owner
  // gets paid), its criteria, its price, and its execution endpoint.
  const agent = body.agentId ? await getAgentById(body.agentId) : null;

  const productId = body.productId ?? agent?.onchainProductId ?? evmConfig.defaultProductId;
  const priceBaseUnits = body.priceBaseUnits ?? agent?.priceBaseUnits ?? 10_000_000; // 10 USDC
  const disputeWindowSeconds = body.disputeWindowSeconds ?? 10;

  // Load the caller's own signing wallet.
  let wallet: ethers.Wallet;
  try {
    wallet = caller.user
      ? await getUserWallet(caller.user.sub)
      : await getUserWalletByAddress(caller.onChainAddress);
  } catch (e) {
    return Response.json(
      { error: `could not load your wallet: ${(e as Error).message}` },
      { status: 400 },
    );
  }
  const customerAddr = wallet.address;
  await fundWalletIfNeeded(customerAddr).catch(() => undefined);

  // Criteria come from the request, else the agent's template, else a default.
  const criteria: SuccessCriterion =
    body.criteria ??
    (agent?.criteriaTemplate as SuccessCriterion | undefined) ?? {
      type: "all_of",
      criteria: [
        { type: "exact", path: "/ticket_status", value: "closed" },
        { type: "numeric_threshold", path: "/refund_amount", op: "<=", value: 100 },
      ],
    };

  // Outcome + costs: when running a registered agent, they come from RUNNING it
  // (below). For a direct SDK caller with no agent, they come from the request
  // (your agent already ran). We resolve these inside the stream so the "agent
  // runs" stage can report progress and errors.
  const directOutcome: Record<string, unknown> | null =
    !agent && body.outcome ? body.outcome : null;
  const directCostItems: LifecycleCostItem[] | null =
    !agent && body.costItems ? body.costItems : null;

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const enc = new TextEncoder();
  let writerOpen = true;
  async function emit(event: string, data: Record<string, unknown>): Promise<void> {
    if (!writerOpen) return;
    try {
      await writer.write(enc.encode(JSON.stringify({ event, data }) + "\n"));
    } catch {
      writerOpen = false;
    }
  }

  void (async () => {
    try {
      await emit("start", {
        caller: caller.via,
        customer: customerAddr,
        productId,
        priceBaseUnits,
        disputeWindowSeconds,
      });

      // 1. Quote
      await emit("stage", { stage: "quote", status: "started" });
      const q = await createQuote(wallet, {
        productId,
        customer: customerAddr,
        priceBaseUnits,
        criteriaBytes: Array.from(encodeCriteriaBytes(criteria)),
        expiresAtMs: Date.now() + 60 * 60 * 1000,
      });
      await emit("stage", {
        stage: "quote",
        status: "done",
        id: q.quoteId,
        digest: q.txHash,
        explorer: explorerTxUrl(q.txHash),
      });

      // 2. Workflow + escrow
      await emit("stage", { stage: "workflow", status: "started" });
      const w = await createWorkflow(wallet, {
        quoteId: q.quoteId,
        paymentBaseUnits: priceBaseUnits,
      });
      if (body.agentId) {
        try {
          await linkWorkflowToAgent(w.workflowId, body.agentId);
        } catch {
          // best-effort
        }
      }
      await emit("stage", {
        stage: "workflow",
        status: "done",
        id: w.workflowId,
        digest: w.txHash,
        explorer: explorerTxUrl(w.txHash),
      });

      // 3. Execution — RUN THE AGENT to produce the real outcome + costs.
      await emit("stage", { stage: "execution", status: "started" });
      let outcome: Record<string, unknown>;
      let costItems: LifecycleCostItem[];
      if (agent) {
        const run = await runAgent({
          endpoint: agent.executionEndpoint,
          declaredOutcome: (agent.exampleOutcome as Record<string, unknown>) ?? {},
          taskInput: body.taskInput,
          criteria,
          priceBaseUnits,
          workflowId: w.workflowId,
        });
        outcome = run.outcome;
        costItems = run.costItems;
        await emit("stage", { stage: "execution", status: "ran", source: run.source });
      } else {
        outcome = directOutcome ?? { ticket_status: "closed", refund_amount: 47.5 };
        costItems = directCostItems ?? [];
      }
      const e = await recordExecution(wallet, {
        workflowId: w.workflowId,
        startedAtMs: Date.now() - 5_000,
        costItems,
        traceBlobId: "user_trace_blob",
      });
      await emit("stage", {
        stage: "execution",
        status: "done",
        id: w.workflowId,
        digest: e.txHash,
        explorer: explorerTxUrl(e.txHash),
      });

      // 4. Verify
      await emit("stage", { stage: "verify", status: "started" });
      const baseUrl = new URL(req.url).origin;
      const verifyResp = await fetch(`${baseUrl}/api/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: w.workflowId,
          criteria,
          outcome,
          costTrace: costItems,
          disputeWindowSeconds,
        }),
      });
      if (!verifyResp.ok) {
        throw new Error(`/api/verify ${verifyResp.status}: ${await verifyResp.text()}`);
      }
      const verify = (await verifyResp.json()) as VerifyResponse;
      await emit("stage", {
        stage: "verify",
        status: "done",
        success: verify.success,
        walrus: verify.walrus,
        signaturePrefix: verify.signatureHex.slice(0, 16) + "…",
      });

      // 5. Outcome on chain
      await emit("stage", { stage: "outcome", status: "started" });
      const o = await submitAttestationDev(wallet, {
        workflowId: w.workflowId,
        verify,
        disputeWindowSeconds,
      });
      await emit("stage", {
        stage: "outcome",
        status: "done",
        id: w.workflowId,
        digest: o.txHash,
        explorer: explorerTxUrl(o.txHash),
      });

      // 6. Dispute window (poll the contract, not wall clock)
      await emit("stage", { stage: "dispute_window", status: "started", waitMs: disputeWindowSeconds * 1000 });
      await waitForDisputeWindow(w.workflowId);
      await emit("stage", { stage: "dispute_window", status: "done" });

      // 7. Settlement
      await emit("stage", { stage: "settle", status: "started" });
      const s = await settleWorkflowDev(wallet, { workflowId: w.workflowId, verify });
      await emit("stage", {
        stage: "settle",
        status: "done",
        refunded: s.refunded,
        id: w.workflowId,
        digest: s.txHash,
        explorer: explorerTxUrl(s.txHash),
      });

      try {
        await fetch(`${baseUrl}/api/keeper/index-tick`, { method: "POST" });
      } catch {
        // best-effort
      }

      await emit("complete", {
        quoteId: q.quoteId,
        workflowId: w.workflowId,
        refunded: s.refunded,
        workflowExplorer: explorerAddressUrl(evmConfig.coreAddress),
        settlementExplorer: explorerTxUrl(s.txHash),
      });
    } catch (err) {
      await emit("error", { message: (err as Error).message });
    } finally {
      try {
        if (writerOpen) await writer.close();
      } catch {
        // already closed
      }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
