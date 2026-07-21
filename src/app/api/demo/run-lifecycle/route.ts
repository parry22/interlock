// /api/demo/run-lifecycle — clickable end-to-end Interlock lifecycle.
//
// Streams NDJSON stage events so the browser shows progress in real time.
// Runs the full 7-stage lifecycle against WeaveosCore on Avalanche Fuji,
// signed by the signed-in user's own wallet (so the workflow is genuinely
// theirs — their escrow, their refund). Falls back to the platform admin
// wallet for an anonymous demo.

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
  walletFromHex,
  explorerTxUrl,
  explorerAddressUrl,
  evmConfig,
} from "@/lib/interlock/lifecycle";
import { registryContract } from "@/lib/interlock/evm";
import { encodeCriteriaBytes, type SuccessCriterion } from "@/lib/interlock/dsl";
import { interlockSecrets } from "@/lib/interlock/config";
import { getCurrentUser } from "@/lib/interlock/session";
import { getUserWallet, fundWalletIfNeeded } from "@/lib/interlock/wallets";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

type RunBody = {
  outcomeMode?: "success" | "failure";
  disputeWindowSeconds?: number;
  quotePriceBaseUnits?: number;
};

export async function POST(req: NextRequest): Promise<Response> {
  const limited = rateLimit(req, "run-lifecycle", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  let body: RunBody = {};
  try {
    body = (await req.json()) as RunBody;
  } catch {
    // Empty body is fine — fall through to defaults.
  }
  const outcomeMode = body.outcomeMode ?? "success";
  const disputeWindowSeconds = body.disputeWindowSeconds ?? 10;
  const quotePrice = body.quotePriceBaseUnits ?? 10_000_000; // 10 USDC (6 decimals)
  const productId = evmConfig.defaultProductId;

  // Signing identity: the signed-in user's own wallet. For an anonymous demo,
  // fall back to the dedicated demo-customer wallet (NOT the admin/agent-company
  // wallet, which would trip the contract's no-self-pay check at settlement).
  const user = await getCurrentUser();
  const demoCustomerKey = process.env.INTERLOCK_CUSTOMER_PRIVKEY ?? interlockSecrets.adminPrivkey;
  let wallet: ethers.Wallet;
  try {
    wallet = user ? await getUserWallet(user.sub) : walletFromHex(demoCustomerKey);
  } catch {
    wallet = walletFromHex(demoCustomerKey);
  }
  const customerAddr = wallet.address;

  // Make sure the customer wallet can pay gas + escrow before we start.
  await fundWalletIfNeeded(customerAddr).catch(() => undefined);

  // Demo cost recipients must be registered providers. The deploy seeded the
  // registry admin as both the model + tool provider, so use that address.
  const registry = registryContract();
  const demoProvider = await registry.admin();

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
      const criteria: SuccessCriterion = {
        type: "all_of",
        criteria: [
          { type: "exact", path: "/ticket_status", value: "closed" },
          { type: "numeric_threshold", path: "/refund_amount", op: "<=", value: 100 },
        ],
      };
      const outcome =
        outcomeMode === "success"
          ? { ticket_status: "closed", refund_amount: 47.5 }
          : { ticket_status: "open", refund_amount: 9999 };
      const costTrace: LifecycleCostItem[] = [
        { provider: demoProvider, category: 0, units: 12000, amount: 2_000_000 }, // model, 2 USDC
        { provider: demoProvider, category: 1, units: 3, amount: 500_000 }, // tool, 0.5 USDC
      ];

      await emit("start", {
        customer: customerAddr,
        productId,
        priceBaseUnits: quotePrice,
        outcomeMode,
        disputeWindowSeconds,
        signingMode: "ecdsa",
      });

      // === Stage 1: Quote ===
      await emit("stage", { stage: "quote", status: "started" });
      const q = await createQuote(wallet, {
        productId,
        customer: customerAddr,
        priceBaseUnits: quotePrice,
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

      // === Stage 2: Workflow + escrow (USDC approve + lock) ===
      await emit("stage", { stage: "workflow", status: "started" });
      const w = await createWorkflow(wallet, {
        quoteId: q.quoteId,
        paymentBaseUnits: quotePrice,
      });
      await emit("stage", {
        stage: "workflow",
        status: "done",
        id: w.workflowId,
        digest: w.txHash,
        explorer: explorerTxUrl(w.txHash),
      });

      // === Stage 3: Execution ===
      await emit("stage", { stage: "execution", status: "started" });
      const e = await recordExecution(wallet, {
        workflowId: w.workflowId,
        startedAtMs: Date.now() - 5_000,
        costItems: costTrace,
        traceBlobId: "demo_trace_blob",
      });
      await emit("stage", {
        stage: "execution",
        status: "done",
        id: w.workflowId,
        digest: e.txHash,
        explorer: explorerTxUrl(e.txHash),
      });

      // === Stage 4: /api/verify ===
      await emit("stage", { stage: "verify", status: "started" });
      const baseUrl = new URL(req.url).origin;
      const verifyResp = await fetch(`${baseUrl}/api/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: w.workflowId,
          criteria,
          outcome,
          costTrace,
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

      // === Stage 5: Outcome on chain ===
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

      // === Stage 6: Dispute window (poll the contract, not wall clock) ===
      await emit("stage", { stage: "dispute_window", status: "started", waitMs: disputeWindowSeconds * 1000 });
      await waitForDisputeWindow(w.workflowId);
      await emit("stage", { stage: "dispute_window", status: "done" });

      // === Stage 7: Settlement ===
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

      // Refresh the Postgres mirror so the new workflow appears immediately.
      try {
        await fetch(`${baseUrl}/api/keeper/index-tick`, { method: "POST" });
      } catch {
        // ignore
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
