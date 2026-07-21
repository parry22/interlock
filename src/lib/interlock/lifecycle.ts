// Workflow lifecycle writes against WeaveosCore on Avalanche Fuji.
//
// Each stage is a single contract call signed by an ethers Wallet (the
// customer's own custodial wallet for stages 1–3 and dispute filing; anyone
// for permissionless settlement). Replaces the Sui-era PTB builder — on the
// EVM every multi-step settlement is atomic within one transaction natively.
//
// Payment flow difference vs Sui: escrow is ERC20 (USDC), so workflow
// creation is approve() + createWorkflowFromQuote() — two transactions —
// instead of splitting a native coin inside one PTB.

import { ethers } from "ethers";

import {
  type VerifierResult,
  buildPayload,
  blobIdToBytes,
  coreContract,
  usdcContract,
  evmConfig,
} from "./evm";

export { walletFromHex, getProvider, evmConfig, explorerTxUrl, explorerAddressUrl } from "./evm";

export type LifecycleCostItem = {
  provider: string;
  category: number; // 0 model | 1 tool | 2 human | 3 compute
  units: number;
  amount: number; // USDC base units (6 decimals)
};

/** Response shape of POST /api/verify — everything needed to reconstruct
 *  and submit the byte-identical signed payload on chain. */
export type VerifyResponse = VerifierResult & {
  walrus?: Record<string, string>;
};

// === Internal helpers ===

async function waitReceipt(tx: ethers.TransactionResponse): Promise<ethers.TransactionReceipt> {
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`tx ${tx.hash} reverted`);
  }
  return receipt;
}

/** Pull a named event out of a receipt (logs from other contracts are skipped). */
function findEvent(
  receipt: ethers.TransactionReceipt,
  contract: ethers.Contract,
  eventName: string,
): ethers.Result | null {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== (contract.target as string).toLowerCase()) continue;
    try {
      const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === eventName) return parsed.args;
    } catch {
      // not one of ours
    }
  }
  return null;
}

// === Stage 1: Quote ===

export async function createQuote(
  wallet: ethers.Wallet,
  params: {
    productId: number;
    customer: string;
    priceBaseUnits: number;
    criteriaBytes: Uint8Array | number[];
    expiresAtMs: number;
  },
): Promise<{ quoteId: string; txHash: string }> {
  const core = coreContract(wallet);
  const tx = await core.createQuote(
    params.productId,
    params.customer,
    params.priceBaseUnits,
    0, // PRICING_FIXED — only model supported in MVP
    new Uint8Array(params.criteriaBytes),
    params.expiresAtMs,
    "0x",
  );
  const receipt = await waitReceipt(tx);
  const ev = findEvent(receipt, core, "QuoteCreated");
  if (!ev) throw new Error("QuoteCreated event not found in receipt");
  return { quoteId: ev.quoteId.toString(), txHash: receipt.hash };
}

// === Stage 2: payment authorization (USDC approve + escrow lock) ===

export async function createWorkflow(
  wallet: ethers.Wallet,
  params: { quoteId: string | number; paymentBaseUnits: number },
): Promise<{ workflowId: string; txHash: string; approveTxHash: string }> {
  const usdc = usdcContract(wallet);
  const core = coreContract(wallet);

  const approveTx = await usdc.approve(evmConfig.coreAddress, params.paymentBaseUnits);
  const approveReceipt = await waitReceipt(approveTx);

  const tx = await core.createWorkflowFromQuote(params.quoteId, params.paymentBaseUnits);
  const receipt = await waitReceipt(tx);
  const ev = findEvent(receipt, core, "WorkflowCreated");
  if (!ev) throw new Error("WorkflowCreated event not found in receipt");
  return {
    workflowId: ev.workflowId.toString(),
    txHash: receipt.hash,
    approveTxHash: approveReceipt.hash,
  };
}

// === Stage 3: Execution record ===

export async function recordExecution(
  wallet: ethers.Wallet,
  params: {
    workflowId: string | number;
    startedAtMs: number;
    costItems: LifecycleCostItem[];
    traceBlobId: string;
  },
): Promise<{ txHash: string }> {
  const core = coreContract(wallet);
  const tx = await core.recordExecution(
    params.workflowId,
    params.startedAtMs,
    params.costItems,
    blobIdToBytes(params.traceBlobId),
  );
  const receipt = await waitReceipt(tx);
  return { txHash: receipt.hash };
}

// === Stage 5: outcome on chain (verifier-signed payload) ===

export async function submitAttestationDev(
  wallet: ethers.Wallet,
  params: {
    workflowId: string | number;
    verify: VerifyResponse;
    disputeWindowSeconds: number;
  },
): Promise<{ txHash: string; disputeWindowEndsMs: number }> {
  const core = coreContract(wallet);
  const payload = buildPayload(params.workflowId, params.verify);
  const atts = [{ signer: params.verify.signerAddress, signature: params.verify.signatureHex }];
  const tx = await core.verifyAndRecordOutcomeDev(
    params.workflowId,
    payload,
    atts,
    params.disputeWindowSeconds,
  );
  const receipt = await waitReceipt(tx);
  const ev = findEvent(receipt, core, "OutcomeVerified");
  return {
    txHash: receipt.hash,
    disputeWindowEndsMs: ev ? Number(ev.disputeWindowEndsMs) : 0,
  };
}

// === Stage 6: dispute filing (customer only, while window open) ===

export async function fileDispute(
  wallet: ethers.Wallet,
  params: { workflowId: string | number; evidenceBlobId: string },
): Promise<{ txHash: string }> {
  const core = coreContract(wallet);
  const tx = await core.fileDispute(params.workflowId, blobIdToBytes(params.evidenceBlobId));
  const receipt = await waitReceipt(tx);
  return { txHash: receipt.hash };
}

/** Admin arbitration: refund the customer (dispute upheld) or dismiss the
 *  dispute so settlement can proceed. Signer must be the registry admin. */
export async function resolveDispute(
  adminWallet: ethers.Wallet,
  params: { workflowId: string | number; refundCustomer: boolean },
): Promise<{ txHash: string }> {
  const core = coreContract(adminWallet);
  const tx = await core.resolveDispute(params.workflowId, params.refundCustomer);
  const receipt = await waitReceipt(tx);
  return { txHash: receipt.hash };
}

/** Poll the contract's own dispute-window view until it reports closed.
 *  More robust than a wall-clock sleep — the contract compares block
 *  timestamps, which lag wall clock on Fuji by a few seconds. */
export async function waitForDisputeWindow(
  workflowId: string | number,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<void> {
  const core = coreContract();
  const timeoutMs = opts?.timeoutMs ?? 40_000;
  const intervalMs = opts?.intervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await core.disputeWindowClosed(workflowId)) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`dispute window for workflow ${workflowId} did not close within ${timeoutMs}ms`);
}

// === Stage 7: settlement (permissionless once window closes) ===

export async function settleWorkflowDev(
  wallet: ethers.Wallet,
  params: { workflowId: string | number; verify: VerifyResponse },
): Promise<{ txHash: string; refunded: boolean; totalSettled: number; platformFee: number }> {
  const core = coreContract(wallet);
  const payload = buildPayload(params.workflowId, params.verify);
  const atts = [{ signer: params.verify.signerAddress, signature: params.verify.signatureHex }];
  const tx = await core.settleWorkflowDev(params.workflowId, payload, atts);
  const receipt = await waitReceipt(tx);

  const refundedEv = findEvent(receipt, core, "WorkflowRefunded");
  if (refundedEv) {
    return { txHash: receipt.hash, refunded: true, totalSettled: 0, platformFee: 0 };
  }
  const settledEv = findEvent(receipt, core, "WorkflowSettled");
  return {
    txHash: receipt.hash,
    refunded: false,
    totalSettled: settledEv ? Number(settledEv.totalSettled) : 0,
    platformFee: settledEv ? Number(settledEv.platformFee) : 0,
  };
}
