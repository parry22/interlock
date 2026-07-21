// Avalanche C-Chain (Fuji) client layer — config, contract handles, and the
// attestation payload encoding + ECDSA signing that binds the off-chain
// verifier to WeaveosCore.verifyDevAttestations.
//
// Replaces the Sui-era bcs.ts (BCS serialization) + signer.ts (ed25519):
// the canonical signed bytes are now `keccak256(abi.encode(payload))`,
// signed EIP-191 style, exactly what WeaveosCore._recover expects.
//
// Contract source of truth: backend/evm/src/*.sol
// Deployment record:        backend/evm/deployments/fuji.json

import { ethers } from "ethers";

// === Config ===

export const evmConfig = {
  rpc: process.env.AVALANCHE_RPC ?? "https://api.avax-test.network/ext/bc/C/rpc",
  chainId: 43113,
  coreAddress: process.env.INTERLOCK_CORE_ADDRESS ?? "0x27C23b7921ACf27fb2E3778C9A13436A0a8ac947",
  registryAddress:
    process.env.INTERLOCK_REGISTRY_ADDRESS ?? "0x70D64db680ACF0F477a74b9f0e9F587904D331d5",
  usdcAddress: process.env.INTERLOCK_USDC_ADDRESS ?? "0x598279AE42F7A55aB2Ef7a081c9CA11C7b572F79",
  /** Demo product seeded by the deploy script. Users can create their own. */
  defaultProductId: Number(process.env.INTERLOCK_DEFAULT_PRODUCT_ID ?? 1),
  usdcDecimals: 6,
  explorerBase: "https://testnet.snowtrace.io",
} as const;

export function explorerTxUrl(txHash: string): string {
  return `${evmConfig.explorerBase}/tx/${txHash}`;
}

export function explorerAddressUrl(addr: string): string {
  return `${evmConfig.explorerBase}/address/${addr}`;
}

// === ABIs (human-readable fragments — must match backend/evm/src) ===

const COST_ITEM = "tuple(address provider,uint8 category,uint64 units,uint64 amount)";
const SPLIT = "tuple(address recipient,uint64 amount,uint8 role)";
const DEV_ATT = "tuple(address signer,bytes signature)";
export const PAYLOAD_TUPLE =
  `tuple(uint256 workflowId,bool outcomeSuccess,bytes outcomeBlobId,bytes traceBlobId,` +
  `bytes proofBlobId,${COST_ITEM}[] reconciledCostItems,${SPLIT}[] splits,` +
  `uint64 platformFee,bytes32 nonce,uint64 timestampMs)`;

const QUOTE_STRUCT =
  "tuple(uint256 productId,address customer,uint64 price,uint8 pricingModel," +
  "bytes successCriteria,bytes32 successCriteriaHash,uint64 expiresAtMs," +
  "bytes issuerAttestation,uint64 createdAtMs,bool exists)";
const WORKFLOW_STRUCT =
  "tuple(address customer,uint256 productId,uint8 status,uint256 quoteId," +
  "bool hasExecution,bool hasOutcome,bool hasSettlement,uint8 openDisputeCount," +
  "uint256 escrowBalance,uint64 totalRevenue,uint64 totalCost,uint64 margin," +
  "uint64 createdAtMs,uint64 updatedAtMs,bool exists)";
const EXECUTION_STRUCT =
  `tuple(uint64 startedAtMs,uint64 completedAtMs,bytes traceBlobId,${COST_ITEM}[] costItems,uint64 totalCost)`;
const OUTCOME_STRUCT =
  "tuple(bool success,bytes artifactBlobId,bytes proofBlobId,bytes teeAttestation," +
  "bytes enclaveMeasurement,uint64 verifiedAtMs,uint64 disputeWindowEndsMs)";
const SETTLEMENT_STRUCT =
  `tuple(${SPLIT}[] splits,uint64 totalSettled,uint64 platformFee,uint64 settledAtMs)`;

export const CORE_ABI = [
  // lifecycle writes
  `function createQuote(uint256 productId,address customer,uint64 price,uint8 pricingModel,bytes successCriteria,uint64 expiresAtMs,bytes issuerAttestation) returns (uint256)`,
  `function createWorkflowFromQuote(uint256 quoteId,uint256 amount) returns (uint256)`,
  `function recordExecution(uint256 workflowId,uint64 startedAtMs,${COST_ITEM}[] costItems,bytes traceBlobId)`,
  `function verifyAndRecordOutcomeDev(uint256 workflowId,${PAYLOAD_TUPLE} payload,${DEV_ATT}[] atts,uint64 disputeWindowSeconds)`,
  `function settleWorkflowDev(uint256 workflowId,${PAYLOAD_TUPLE} payload,${DEV_ATT}[] atts)`,
  `function fileDispute(uint256 workflowId,bytes evidenceBlobId)`,
  `function resolveDispute(uint256 workflowId,bool refundCustomer)`,
  // views
  `function payloadDigest(${PAYLOAD_TUPLE} payload) pure returns (bytes32)`,
  `function nextQuoteId() view returns (uint256)`,
  `function nextWorkflowId() view returns (uint256)`,
  `function getQuote(uint256 quoteId) view returns (${QUOTE_STRUCT})`,
  `function getWorkflow(uint256 workflowId) view returns (${WORKFLOW_STRUCT})`,
  `function getExecution(uint256 workflowId) view returns (${EXECUTION_STRUCT})`,
  `function getOutcome(uint256 workflowId) view returns (${OUTCOME_STRUCT})`,
  `function getSettlement(uint256 workflowId) view returns (${SETTLEMENT_STRUCT})`,
  `function disputeWindowClosed(uint256 workflowId) view returns (bool)`,
  // events
  `event QuoteCreated(uint256 indexed quoteId,uint256 indexed productId,address indexed customer,uint64 price,uint8 pricingModel,uint64 expiresAtMs)`,
  `event WorkflowCreated(uint256 indexed workflowId,address indexed customer,uint256 indexed productId,uint256 quoteId,uint256 escrowed)`,
  `event WorkflowStatusChanged(uint256 indexed workflowId,uint8 fromStatus,uint8 toStatus)`,
  `event ExecutionRecorded(uint256 indexed workflowId,uint64 totalCost,uint256 itemCount)`,
  `event OutcomeVerified(uint256 indexed workflowId,bool success,uint64 disputeWindowEndsMs)`,
  `event DisputeFiled(uint256 indexed workflowId,bytes evidenceBlobId,address filedBy)`,
  `event DisputeResolved(uint256 indexed workflowId,bool refunded,address resolvedBy)`,
  `event WorkflowSettled(uint256 indexed workflowId,uint64 totalSettled,uint64 platformFee)`,
  `event WorkflowRefunded(uint256 indexed workflowId,uint256 refundAmount)`,
];

export const REGISTRY_ABI = [
  `function admin() view returns (address)`,
  `function createProduct(string slug,address agentCompany,uint16 feeBps,uint64 feeCap,uint16 feeMaxBps,uint8 minAttestations,uint8 failurePolicy) returns (uint256)`,
  `function deactivateProduct(uint256 productId)`,
  `function allowDevSigner(uint256 productId,address signer)`,
  `function registerProvider(address addr,uint8 role,string name)`,
  `function nextProductId() view returns (uint256)`,
  `function getProduct(uint256 productId) view returns (tuple(string slug,address agentCompany,uint16 feeBps,uint64 feeCap,uint16 feeMaxBps,uint8 minAttestations,uint8 failurePolicy,bool active,uint64 createdAtMs,bool exists))`,
  `function isDevSignerAllowed(uint256 productId,address signer) view returns (bool)`,
  `function isRegisteredProvider(address addr,uint8 role) view returns (bool)`,
  `event ProductCreated(uint256 indexed productId,string slug,address agentCompany)`,
  `event ProviderRegistered(address indexed addr,uint8 role,string name)`,
];

export const ERC20_ABI = [
  `function balanceOf(address) view returns (uint256)`,
  `function allowance(address owner,address spender) view returns (uint256)`,
  `function approve(address spender,uint256 amount) returns (bool)`,
  `function transfer(address to,uint256 amount) returns (bool)`,
  `function mint(address to,uint256 amount)`,
  `function decimals() view returns (uint8)`,
];

// === Provider / contract singletons ===

let _provider: ethers.JsonRpcProvider | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(evmConfig.rpc, evmConfig.chainId, {
      staticNetwork: true,
    });
  }
  return _provider;
}

export function coreContract(signer?: ethers.Signer): ethers.Contract {
  return new ethers.Contract(evmConfig.coreAddress, CORE_ABI, signer ?? getProvider());
}

export function registryContract(signer?: ethers.Signer): ethers.Contract {
  return new ethers.Contract(evmConfig.registryAddress, REGISTRY_ABI, signer ?? getProvider());
}

export function usdcContract(signer?: ethers.Signer): ethers.Contract {
  return new ethers.Contract(evmConfig.usdcAddress, ERC20_ABI, signer ?? getProvider());
}

export function walletFromHex(privkeyHex: string): ethers.Wallet {
  return new ethers.Wallet(privkeyHex, getProvider());
}

// === Attestation payload — the shape WeaveosCore verifies ===

export type CostItem = {
  provider: string;
  category: number;
  units: number;
  amount: number; // USDC base units (6 decimals)
};

export type Split = {
  recipient: string;
  amount: number;
  role: number;
};

export type AttestationPayload = {
  workflowId: bigint | number | string;
  outcomeSuccess: boolean;
  outcomeBlobId: Uint8Array | string; // bytes (hex string or raw)
  traceBlobId: Uint8Array | string;
  proofBlobId: Uint8Array | string;
  reconciledCostItems: CostItem[];
  splits: Split[];
  platformFee: number;
  nonce: string; // 0x-prefixed 32-byte hex
  timestampMs: number;
};

/** Canonical digest: keccak256(abi.encode(payload)) — identical to the
 *  contract's `payloadDigest` view, which the roundtrip test asserts. */
export function payloadDigest(p: AttestationPayload): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode([PAYLOAD_TUPLE], [p]);
  return ethers.keccak256(encoded);
}

/** ECDSA-sign the payload digest, EIP-191 personal-message style —
 *  exactly what WeaveosCore._recover verifies via ecrecover. */
export async function signPayload(
  p: AttestationPayload,
  signerWallet: ethers.Wallet,
): Promise<{ digestHex: string; signatureHex: string; signerAddress: string }> {
  const digestHex = payloadDigest(p);
  const signatureHex = await signerWallet.signMessage(ethers.getBytes(digestHex));
  return { digestHex, signatureHex, signerAddress: signerWallet.address };
}

export function verifyPayloadSignature(
  p: AttestationPayload,
  signatureHex: string,
  expectedSigner: string,
): boolean {
  const digestHex = payloadDigest(p);
  const recovered = ethers.verifyMessage(ethers.getBytes(digestHex), signatureHex);
  return recovered.toLowerCase() === expectedSigner.toLowerCase();
}

/** Encode a Walrus blob ID (or any short string) as on-chain `bytes`. */
export function blobIdToBytes(blobId: string): Uint8Array {
  return ethers.toUtf8Bytes(blobId);
}

export function bytesToBlobId(hex: string): string {
  try {
    return ethers.toUtf8String(hex);
  } catch {
    return hex;
  }
}

// === Shared payload construction ===
//
// /api/verify signs a payload; the submitting side must reconstruct the
// byte-identical payload for the contract call. Both go through this one
// function so they can never drift.

export type VerifierResult = {
  success: boolean;
  outcomeBlobId: string;
  traceBlobId: string;
  proofBlobId: string;
  reconciledCostItems: CostItem[];
  splits: Split[];
  platformFee: number;
  nonceHex: string;
  timestampMs: number;
  digestHex: string;
  signatureHex: string;
  signerAddress: string;
};

export function buildPayload(workflowId: number | string, v: VerifierResult): AttestationPayload {
  return {
    workflowId: BigInt(workflowId),
    outcomeSuccess: v.success,
    outcomeBlobId: blobIdToBytes(v.outcomeBlobId),
    traceBlobId: blobIdToBytes(v.traceBlobId),
    proofBlobId: blobIdToBytes(v.proofBlobId),
    reconciledCostItems: v.reconciledCostItems,
    splits: v.splits,
    platformFee: v.platformFee,
    nonce: v.nonceHex,
    timestampMs: v.timestampMs,
  };
}
