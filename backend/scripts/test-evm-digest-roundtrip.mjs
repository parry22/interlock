// Asserts the TS-side payload encoding is byte-identical to the contract's:
//   keccak256(abi.encode(payload)) [TS] === WeaveosCore.payloadDigest(payload) [Fuji]
// and that an EIP-191 ECDSA signature over that digest recovers correctly.
// Run: node backend/scripts/test-evm-digest-roundtrip.mjs

import { ethers } from "ethers";

const RPC = "https://api.avax-test.network/ext/bc/C/rpc";
const CORE = "0x27C23b7921ACf27fb2E3778C9A13436A0a8ac947";

const COST_ITEM = "tuple(address provider,uint8 category,uint64 units,uint64 amount)";
const SPLIT = "tuple(address recipient,uint64 amount,uint8 role)";
const PAYLOAD_TUPLE =
  `tuple(uint256 workflowId,bool outcomeSuccess,bytes outcomeBlobId,bytes traceBlobId,` +
  `bytes proofBlobId,${COST_ITEM}[] reconciledCostItems,${SPLIT}[] splits,` +
  `uint64 platformFee,bytes32 nonce,uint64 timestampMs)`;

const provider = new ethers.JsonRpcProvider(RPC, 43113, { staticNetwork: true });
const core = new ethers.Contract(
  CORE,
  [`function payloadDigest(${PAYLOAD_TUPLE} payload) pure returns (bytes32)`],
  provider,
);

const payload = {
  workflowId: 7n,
  outcomeSuccess: true,
  outcomeBlobId: ethers.toUtf8Bytes("outcome-blob-xyz"),
  traceBlobId: ethers.toUtf8Bytes("trace-blob-abc"),
  proofBlobId: ethers.toUtf8Bytes("proof-blob-123"),
  reconciledCostItems: [
    { provider: "0x584b37cA94889a0cd905c9e8dB3670bbBCDE73bD", category: 0, units: 12000, amount: 20_000_000 },
    { provider: "0x584b37cA94889a0cd905c9e8dB3670bbBCDE73bD", category: 1, units: 3, amount: 2_000_000 },
  ],
  splits: [
    { recipient: "0x584b37cA94889a0cd905c9e8dB3670bbBCDE73bD", amount: 73_000_000, role: 0 },
    { recipient: "0x584b37cA94889a0cd905c9e8dB3670bbBCDE73bD", amount: 5_000_000, role: 4 },
  ],
  platformFee: 5_000_000,
  nonce: ethers.hexlify(ethers.randomBytes(32)),
  timestampMs: Date.now(),
};

const localEncoded = ethers.AbiCoder.defaultAbiCoder().encode([PAYLOAD_TUPLE], [payload]);
const localDigest = ethers.keccak256(localEncoded);
const chainDigest = await core.payloadDigest(payload);

console.log("local digest:", localDigest);
console.log("chain digest:", chainDigest);
if (localDigest !== chainDigest) {
  console.error("MISMATCH — TS encoding does not match contract abi.encode");
  process.exit(1);
}

// EIP-191 signature recovery
const wallet = ethers.Wallet.createRandom();
const sig = await wallet.signMessage(ethers.getBytes(localDigest));
const recovered = ethers.verifyMessage(ethers.getBytes(localDigest), sig);
console.log("signer:   ", wallet.address);
console.log("recovered:", recovered);
if (recovered !== wallet.address) {
  console.error("SIGNATURE RECOVERY MISMATCH");
  process.exit(1);
}
console.log("\n✓ digest + signature roundtrip OK — TS layer matches WeaveosCore");
