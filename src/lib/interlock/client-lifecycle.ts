"use client";

// Client-side workflow lifecycle, signed by the user's own connected wallet.
//
// This is the non-custodial path: the customer's MetaMask/Core signs the three
// transactions where they are the on-chain sender (quote, escrow, execution),
// plus the outcome + settle calls. The server only runs the verifier (it holds
// the verifier's signing key). No platform-held customer key is involved.

import { ethers } from "ethers";
import { CORE_ABI, ERC20_ABI, evmConfig, buildPayload, explorerTxUrl } from "./evm";
import { encodeCriteriaBytes, type SuccessCriterion } from "./dsl";

export type ClientStage =
  | "quote" | "workflow" | "execution" | "verify" | "outcome" | "dispute_window" | "settle";

export type StageEmit = (
  stage: ClientStage,
  status: "started" | "done",
  extra?: { txHash?: string; explorer?: string; success?: boolean },
) => void;

export type ClientCostItem = { provider: string; category: number; units: number; amount: number };

function findEvent(receipt: ethers.TransactionReceipt, c: ethers.Contract, name: string) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== (c.target as string).toLowerCase()) continue;
    try {
      const p = c.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (p?.name === name) return p.args;
    } catch {
      /* not ours */
    }
  }
  return null;
}

/** Ensure the connected wallet has USDC to escrow (MockUSDC has an open mint on
 *  testnet). Best-effort — real USDC would require a deposit instead. */
export async function ensureTestUsdc(signer: ethers.Signer, needed: number): Promise<void> {
  const usdc = new ethers.Contract(evmConfig.usdcAddress, ERC20_ABI, signer);
  const me = await signer.getAddress();
  const bal: bigint = await usdc.balanceOf(me);
  if (bal < BigInt(needed)) {
    await (await usdc.mint(me, BigInt(needed) * 10n)).wait();
  }
}

export async function runWorkflowWithWallet(params: {
  signer: ethers.Signer;
  productId: number;
  priceBaseUnits: number;
  criteria: SuccessCriterion;
  outcome: Record<string, unknown>;
  costItems: ClientCostItem[];
  disputeWindowSeconds: number;
  emit: StageEmit;
}): Promise<{ workflowId: string; settleTxHash: string; refunded: boolean }> {
  const { signer, productId, priceBaseUnits, criteria, outcome, costItems, disputeWindowSeconds, emit } = params;
  const core = new ethers.Contract(evmConfig.coreAddress, CORE_ABI, signer);
  const usdc = new ethers.Contract(evmConfig.usdcAddress, ERC20_ABI, signer);
  const customer = await signer.getAddress();

  // 1. Quote
  emit("quote", "started");
  let rc = await (await core.createQuote(
    productId, customer, priceBaseUnits, 0,
    new Uint8Array(encodeCriteriaBytes(criteria)), Date.now() + 3600_000, "0x",
  )).wait();
  const quoteId = findEvent(rc, core, "QuoteCreated")!.quoteId;
  emit("quote", "done", { txHash: rc.hash, explorer: explorerTxUrl(rc.hash) });

  // 2. Approve + escrow (your USDC, from your wallet)
  emit("workflow", "started");
  await (await usdc.approve(evmConfig.coreAddress, priceBaseUnits)).wait();
  rc = await (await core.createWorkflowFromQuote(quoteId, priceBaseUnits)).wait();
  const workflowId = findEvent(rc, core, "WorkflowCreated")!.workflowId;
  emit("workflow", "done", { txHash: rc.hash, explorer: explorerTxUrl(rc.hash) });

  // 3. Execution
  emit("execution", "started");
  rc = await (await core.recordExecution(
    workflowId, Date.now() - 5000, costItems, ethers.toUtf8Bytes("wallet_trace"),
  )).wait();
  emit("execution", "done", { txHash: rc.hash, explorer: explorerTxUrl(rc.hash) });

  // 4. Verify (server holds the verifier key)
  emit("verify", "started");
  const vResp = await fetch("/api/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId: workflowId.toString(), criteria, outcome, costTrace: costItems, disputeWindowSeconds }),
  });
  if (!vResp.ok) throw new Error(`verify ${vResp.status}: ${await vResp.text()}`);
  const v = await vResp.json();
  emit("verify", "done", { success: v.success });

  const payload = buildPayload(workflowId.toString(), v);
  const atts = [{ signer: v.signerAddress, signature: v.signatureHex }];

  // 5. Record outcome on chain
  emit("outcome", "started");
  rc = await (await core.verifyAndRecordOutcomeDev(workflowId, payload, atts, disputeWindowSeconds)).wait();
  emit("outcome", "done", { txHash: rc.hash, explorer: explorerTxUrl(rc.hash) });

  // 6. Dispute window
  emit("dispute_window", "started");
  while (!(await core.disputeWindowClosed(workflowId))) {
    await new Promise((r) => setTimeout(r, 2000));
  }
  emit("dispute_window", "done");

  // 7. Settle (permissionless — you pay the gas)
  emit("settle", "started");
  rc = await (await core.settleWorkflowDev(workflowId, payload, atts)).wait();
  const refunded = Boolean(findEvent(rc, core, "WorkflowRefunded"));
  emit("settle", "done", { txHash: rc.hash, explorer: explorerTxUrl(rc.hash) });

  return { workflowId: workflowId.toString(), settleTxHash: rc.hash, refunded };
}
