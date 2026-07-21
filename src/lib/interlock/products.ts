// On-chain product management.
//
// A "product" is what a workflow settles against: it names the agent company
// that gets paid, the platform fee, and the fee caps. Creating one is an
// admin-signed on-chain call (only the registry owner can create products),
// but the agentCompany is set to whoever's product it is — so the owner, not
// the platform, receives the revenue.
//
// Used by both /api/products (standalone creation) and agent registration
// (every agent gets its own product so its owner gets paid).

import { ethers } from "ethers";

import { registryContract, walletFromHex } from "./evm";
import { interlockSecrets } from "./config";

const FAILURE_FULL_REFUND = 0;

export type CreateProductInput = {
  slug: string;
  /** The wallet that receives revenue for this product's workflows. */
  agentCompany: string;
  /** Platform fee in basis points (0..2000 = 0%..20%). Default 500 (5%). */
  feeBps?: number;
  /** Absolute fee cap in USDC (whole units). Default 100. */
  feeCapUsdc?: number;
};

export type CreateProductResult = {
  productId: number;
  slug: string;
  agentCompany: string;
  feeBps: number;
  txHash: string;
};

/**
 * Create a product on-chain and register the platform dev signer on it so its
 * workflows can be verified. Throws on validation or chain failure.
 */
export async function createProduct(input: CreateProductInput): Promise<CreateProductResult> {
  const slug = input.slug.trim();
  if (slug.length < 2 || slug.length > 48) {
    throw new Error("slug must be 2 to 48 characters");
  }
  if (!ethers.isAddress(input.agentCompany)) {
    throw new Error("agentCompany must be a valid address");
  }
  const feeBps = input.feeBps ?? 500;
  if (feeBps < 0 || feeBps > 2000) {
    throw new Error("platform fee must be between 0% and 20%");
  }
  const feeCap = Math.floor((input.feeCapUsdc ?? 100) * 1_000_000);

  const admin = walletFromHex(interlockSecrets.adminPrivkey);
  const registry = registryContract(admin);

  const tx = await registry.createProduct(
    slug,
    input.agentCompany,
    feeBps,
    feeCap,
    Math.max(feeBps, 500), // feeMaxBps — a little headroom above the set fee
    1, // minAttestations
    FAILURE_FULL_REFUND,
  );
  const receipt = await tx.wait();

  let productId: number | null = null;
  for (const log of receipt.logs) {
    try {
      const parsed = registry.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "ProductCreated") {
        productId = Number(parsed.args.productId);
        break;
      }
    } catch {
      // not one of ours
    }
  }
  if (productId === null) {
    throw new Error("ProductCreated event not found in receipt");
  }

  // Register the platform verifier's signer on this product so outcomes for it
  // can be verified through the same /api/verify path.
  try {
    const signerAddr = walletFromHex(interlockSecrets.devSignerPrivkey).address;
    const regTx = await registry.allowDevSigner(productId, signerAddr);
    await regTx.wait();
  } catch {
    // Best-effort. The product exists; the signer can be added later.
  }

  return { productId, slug, agentCompany: input.agentCompany, feeBps, txHash: receipt.hash };
}
