// /api/verify — outcome verifier (Avalanche dev-signer mode).
//
// The Vercel-hosted replacement for the production TEE verifier. It:
//   1. Loads the workflow + quote + product FROM CHAIN (not from the request)
//   2. Rejects if the submitted criteria don't hash-match the on-chain quote
//      (sha256(criteria) must equal Quote.successCriteriaHash — so criteria
//      can't be swapped after the price was agreed)
//   3. Evaluates the criteria against the submitted outcome
//   4. Enforces cost bounds: provider costs + platform fee ≤ quote price
//   5. Uploads outcome / trace / proof blobs to Walrus
//   6. ECDSA-signs keccak256(abi.encode(payload)) with the dev-signer key —
//      exactly what WeaveosCore.verifyDevAttestations checks via ecrecover
//
// Trust boundary (stated honestly): the OUTCOME and COST NUMBERS still come
// from the caller — real provider-invoice reconciliation is the production
// enclave's job. What this verifier now guarantees on top of the contract's
// own bounds: criteria integrity (hash-bound to the quote), price/fee bounds
// pulled from chain instead of the request, and a replayable public proof
// blob. A dishonest integration can still misreport its own costs within the
// quoted price — it cannot change the price, the fee, the criteria, or pay
// unregistered addresses.

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { ethers } from "ethers";

import { interlockConfig, interlockSecrets } from "@/lib/interlock/config";
import { type SuccessCriterion, evaluate, encodeCriteriaBytes } from "@/lib/interlock/dsl";
import {
  type CostItem,
  type Split,
  type VerifierResult,
  buildPayload,
  coreContract,
  registryContract,
  signPayload,
  walletFromHex,
  evmConfig,
} from "@/lib/interlock/evm";
import { walrusPut } from "@/lib/interlock/walrus";
import { reconcileCosts, type CostReconLine } from "@/lib/interlock/reconcile";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// === Request ===

type CostItemInput = {
  provider: string; // 0x EVM address
  category: number; // 0..3
  units: number;
  amount: number; // USDC base units
};

type VerifyRequest = {
  workflowId: string;
  /** Decoded success criteria — must hash-match the on-chain quote. */
  criteria: SuccessCriterion;
  /** The outcome record the agent produced. Arbitrary JSON. */
  outcome: unknown;
  /** SDK-reported cost items from execution. */
  costTrace: CostItemInput[];
  /** Optional dispute window override in seconds. */
  disputeWindowSeconds?: number;
};

const MAX_COST_ITEMS = 20;

const ROLE_AGENT_COMPANY = 0;
const ROLE_MODEL_PROVIDER = 1;
const ROLE_TOOL = 2;
const ROLE_HUMAN = 3;
const ROLE_PLATFORM = 4;

function categoryToRole(category: number): number | null {
  switch (category) {
    case 0: return ROLE_MODEL_PROVIDER; // model
    case 1: return ROLE_TOOL;
    case 2: return ROLE_HUMAN;
    case 3: return null; // compute → absorbed by agent company
    default: throw new Error(`unknown cost category: ${category}`);
  }
}

// === Route ===

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = rateLimit(req, "verify", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  let body: VerifyRequest;
  try {
    body = (await req.json()) as VerifyRequest;
  } catch (e) {
    return NextResponse.json(
      { error: `invalid JSON body: ${(e as Error).message}` },
      { status: 400 },
    );
  }
  if (!body.workflowId || !body.criteria) {
    return NextResponse.json({ error: "workflowId and criteria are required" }, { status: 400 });
  }
  const costTrace = body.costTrace ?? [];
  if (costTrace.length > MAX_COST_ITEMS) {
    return NextResponse.json(
      { error: `too many cost items (max ${MAX_COST_ITEMS})` },
      { status: 400 },
    );
  }
  for (const c of costTrace) {
    if (!ethers.isAddress(c.provider)) {
      return NextResponse.json(
        { error: `cost item provider is not a valid address: ${c.provider}` },
        { status: 400 },
      );
    }
    if (!Number.isFinite(c.amount) || c.amount < 0) {
      return NextResponse.json({ error: "cost amounts must be >= 0" }, { status: 400 });
    }
  }

  // === 1. Load on-chain state — the request is NOT the source of truth ===
  const core = coreContract();
  const registry = registryContract();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let workflow: any;
  try {
    workflow = await core.getWorkflow(body.workflowId);
  } catch {
    return NextResponse.json({ error: `workflow ${body.workflowId} not found on chain` }, { status: 404 });
  }
  const [quote, product] = await Promise.all([
    core.getQuote(workflow.quoteId),
    registry.getProduct(workflow.productId),
  ]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const quotePrice = Number(quote.price);
  const feeBps = Number(product.feeBps);
  const agentCompany = String(product.agentCompany);
  const customer = String(workflow.customer);
  const platformTreasury =
    process.env.INTERLOCK_PLATFORM_TREASURY ?? (await registry.admin());

  // === 2. Criteria integrity — hash must match what was frozen at quote time ===
  const criteriaBytes = encodeCriteriaBytes(body.criteria);
  const criteriaHash = "0x" + createHash("sha256").update(criteriaBytes).digest("hex");
  const onChainHash = String(quote.successCriteriaHash).toLowerCase();
  if (criteriaHash.toLowerCase() !== onChainHash) {
    return NextResponse.json(
      {
        error:
          "criteria hash mismatch — the submitted success criteria are not the ones this quote was priced against",
        submittedHash: criteriaHash,
        quoteHash: onChainHash,
      },
      { status: 409 },
    );
  }

  // === 3. Evaluate success criteria against the outcome ===
  const evalResult = evaluate(body.criteria, body.outcome);
  const success = evalResult.result;

  // === 4. Build splits with on-chain price/fee bounds ===
  const reconciled: CostItem[] = [];
  const splits: Split[] = [];
  let platformFee = 0;
  let reconLines: CostReconLine[] = [];

  if (success) {
    // Reconcile reported costs against each provider's published rate card.
    // A cost line that claims more than the provider charges is rejected.
    const recon = await reconcileCosts(costTrace);
    reconLines = recon.lines;
    if (!recon.ok) {
      return NextResponse.json(
        {
          error: "cost reconciliation failed — a reported cost exceeds the provider's published rate",
          violations: recon.violations.map((v) => ({
            provider: v.provider,
            category: v.category,
            claimed: v.amount,
            maxAllowed: v.maxAllowed,
          })),
        },
        { status: 422 },
      );
    }

    let providerTotal = 0;
    for (const c of costTrace) {
      const role = categoryToRole(c.category);
      if (role === null) continue;
      reconciled.push({
        provider: c.provider,
        category: c.category,
        units: c.units,
        amount: c.amount,
      });
      splits.push({ recipient: c.provider, amount: c.amount, role });
      providerTotal += c.amount;
    }

    platformFee = Math.floor((quotePrice * feeBps) / 10_000);
    if (platformFee > 0) {
      splits.push({ recipient: platformTreasury, amount: platformFee, role: ROLE_PLATFORM });
    }

    const agentShare = quotePrice - providerTotal - platformFee;
    if (agentShare < 0) {
      return NextResponse.json(
        {
          error: `reported provider costs (${providerTotal}) + platform fee (${platformFee}) exceed the quoted price (${quotePrice})`,
        },
        { status: 422 },
      );
    }
    // Pay the agent company its share — UNLESS the agent company is the same
    // wallet as the customer (someone testing their own agent). The contract
    // forbids paying the customer, so in that case we omit the split and the
    // agent's share simply returns to the customer as settlement residual.
    if (agentShare > 0 && agentCompany.toLowerCase() !== customer.toLowerCase()) {
      splits.push({ recipient: agentCompany, amount: agentShare, role: ROLE_AGENT_COMPANY });
    }
  }

  // === 5. Upload outcome + trace + proof to Walrus ===
  const nonceHex = ethers.hexlify(ethers.randomBytes(32));
  let outcomeBlobId: string;
  let traceBlobId: string;
  let proofBlobId: string;
  try {
    const [outcomeBlob, traceBlob] = await Promise.all([
      walrusPut(JSON.stringify(body.outcome)),
      walrusPut(JSON.stringify(costTrace)),
    ]);
    outcomeBlobId = outcomeBlob.blobId;
    traceBlobId = traceBlob.blobId;

    const proof = {
      evaluationTrace: evalResult.steps,
      llmJudgments: [], // Phase 2: multi-LLM voting evidence
      // Real reconciliation against provider rate cards. Each line is either
      // within the provider's published rate (ok), unpriced (no rate on file),
      // or would have been rejected (over_rate — this proof wouldn't exist).
      costReconciliation: reconLines.map((l) => ({
        provider: l.provider,
        category: l.category,
        units: l.units,
        reportedAmount: l.amount,
        maxAllowed: l.maxAllowed ?? null,
        status: l.status,
      })),
      quoteCriteriaHashHex: criteriaHash,
      boundChecks: {
        quotePriceOnChain: quotePrice,
        feeBpsOnChain: feeBps,
        criteriaHashMatched: true,
        costsReconciledToRateCards: true,
      },
      nonceHex,
    };
    const proofBlob = await walrusPut(JSON.stringify(proof));
    proofBlobId = proofBlob.blobId;
  } catch (e) {
    return NextResponse.json(
      { error: `walrus upload failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }

  // === 6. Sign the canonical payload (ECDSA over keccak256(abi.encode)) ===
  const timestampMs = Date.now();
  const result: Omit<VerifierResult, "digestHex" | "signatureHex" | "signerAddress"> = {
    success,
    outcomeBlobId,
    traceBlobId,
    proofBlobId,
    reconciledCostItems: reconciled,
    splits,
    platformFee,
    nonceHex,
    timestampMs,
  };
  const signerWallet = walletFromHex(interlockSecrets.devSignerPrivkey);
  const payload = buildPayload(body.workflowId, {
    ...result,
    digestHex: "",
    signatureHex: "",
    signerAddress: "",
  });
  const { digestHex, signatureHex, signerAddress } = await signPayload(payload, signerWallet);

  return NextResponse.json({
    ...result,
    digestHex,
    signatureHex,
    signerAddress,
    evaluationTrace: evalResult.steps,
    walrus: { outcomeBlobId, traceBlobId, proofBlobId },
    disputeWindowSeconds: body.disputeWindowSeconds ?? interlockConfig.defaultDisputeWindowSeconds,
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    service: "interlock verifier",
    mode: "avalanche fuji (ECDSA dev signer, Walrus testnet)",
    core: evmConfig.coreAddress,
    guarantees: [
      "criteria hash-bound to on-chain quote",
      "price + fee bounds read from chain, not the request",
      "reported costs reconciled against each provider's published rate card",
      "public replayable proof blob on Walrus",
    ],
    knownLimitations: [
      "providers with no rate card on file are allowed but flagged 'unpriced' in the proof",
      "full provider-invoice reconciliation (live vendor APIs) is the production enclave's job",
    ],
  });
}
