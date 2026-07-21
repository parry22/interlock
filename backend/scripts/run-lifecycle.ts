#!/usr/bin/env tsx
// End-to-end Interlock lifecycle on Avalanche Fuji (dev-signer path).
//
// Usage:
//   1. Start the verifier locally:   npm run dev -- --port 3005
//   2. Run this script:              VERIFIER_URL=http://localhost:3005/api/verify \
//                                      node --env-file=.env.local --import tsx backend/scripts/run-lifecycle.ts
//
// Stages: Quote → Workflow+escrow → Execution → /api/verify → Outcome →
//         dispute window → settle. Prints IDs + USDC balances throughout.

import { ethers } from "ethers";

import {
  createQuote,
  createWorkflow,
  recordExecution,
  settleWorkflowDev,
  submitAttestationDev,
  waitForDisputeWindow,
  walletFromHex,
  explorerTxUrl,
  type VerifyResponse,
} from "@/lib/interlock/lifecycle";
import { registryContract, usdcContract, evmConfig } from "@/lib/interlock/evm";
import { encodeCriteriaBytes, type SuccessCriterion } from "@/lib/interlock/dsl";

const VERIFIER_URL = process.env.VERIFIER_URL ?? "http://localhost:3005/api/verify";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var ${name}`);
  return v;
}

const customer = walletFromHex(need("INTERLOCK_CUSTOMER_PRIVKEY"));
const customerAddr = customer.address;
const productId = evmConfig.defaultProductId;

const PRICE = 10_000_000; // 10 USDC (6 decimals)
const DISPUTE_WINDOW_SECONDS = 15;

const criteria: SuccessCriterion = {
  type: "all_of",
  criteria: [
    { type: "exact", path: "/ticket_status", value: "closed" },
    { type: "numeric_threshold", path: "/refund_amount", op: "<=", value: 100 },
  ],
};

function log(stage: string, msg: string) {
  console.log(`[${stage}] ${msg}`);
}

async function usdcBalance(addr: string): Promise<string> {
  const bal: bigint = await usdcContract().balanceOf(addr);
  return ethers.formatUnits(bal, 6);
}

async function main() {
  log("setup", `customer ${customerAddr}`);
  log("setup", `USDC balance: ${await usdcBalance(customerAddr)}`);

  const demoProvider = await registryContract().admin();
  const costItems = [
    { provider: demoProvider, category: 0, units: 12000, amount: 2_000_000 },
    { provider: demoProvider, category: 1, units: 3, amount: 500_000 },
  ];
  const outcome = { ticket_status: "closed", refund_amount: 47.5 };

  // 1. Quote
  const q = await createQuote(customer, {
    productId,
    customer: customerAddr,
    priceBaseUnits: PRICE,
    criteriaBytes: Array.from(encodeCriteriaBytes(criteria)),
    expiresAtMs: Date.now() + 60 * 60 * 1000,
  });
  log("quote", `id=${q.quoteId} ${explorerTxUrl(q.txHash)}`);

  // 2. Workflow + escrow
  const w = await createWorkflow(customer, { quoteId: q.quoteId, paymentBaseUnits: PRICE });
  log("workflow", `id=${w.workflowId} ${explorerTxUrl(w.txHash)}`);

  // 3. Execution
  const e = await recordExecution(customer, {
    workflowId: w.workflowId,
    startedAtMs: Date.now() - 5000,
    costItems,
    traceBlobId: "cli_trace_blob",
  });
  log("execution", explorerTxUrl(e.txHash));

  // 4. Verify
  const verifyResp = await fetch(VERIFIER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workflowId: w.workflowId,
      criteria,
      outcome,
      costTrace: costItems,
      disputeWindowSeconds: DISPUTE_WINDOW_SECONDS,
    }),
  });
  if (!verifyResp.ok) throw new Error(`verify ${verifyResp.status}: ${await verifyResp.text()}`);
  const verify = (await verifyResp.json()) as VerifyResponse;
  log("verify", `success=${verify.success} signer=${verify.signerAddress}`);

  // 5. Outcome
  const o = await submitAttestationDev(customer, {
    workflowId: w.workflowId,
    verify,
    disputeWindowSeconds: DISPUTE_WINDOW_SECONDS,
  });
  log("outcome", explorerTxUrl(o.txHash));

  // 6. Wait dispute window (poll the contract's own view, not wall clock)
  log("dispute", "waiting for on-chain dispute window to close");
  await waitForDisputeWindow(w.workflowId);

  // 7. Settle
  const s = await settleWorkflowDev(customer, { workflowId: w.workflowId, verify });
  log("settle", `refunded=${s.refunded} total=${s.totalSettled} fee=${s.platformFee} ${explorerTxUrl(s.txHash)}`);
  log("done", `customer USDC balance: ${await usdcBalance(customerAddr)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
