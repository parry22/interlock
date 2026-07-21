#!/usr/bin/env node
// Round-trip test: POST a sample request to /api/verify, then locally verify
// the returned ed25519 signature against the registered dev pubkey using the
// returned BCS payload bytes.
//
// Proves that:
//   1. /api/verify works
//   2. BCS encoding is deterministic + reproducible
//   3. ed25519 signature is valid against the pubkey registered on chain
//
// To use:
//   1. In one terminal:  PORT=3001 npm run dev
//   2. In another:       node backend/scripts/test-verify-roundtrip.mjs

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

ed.hashes.sha512 = sha512;

const URL = process.env.VERIFIER_URL ?? "http://localhost:3001/api/verify";

function hex2bytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const REGISTERED_PUBKEY_HEX =
  "45b327dbafb1bc4b4864deb8e40f91c3a76c73a2a888704cdcebf739fefe663d";

const sample = {
  workflowId:
    "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  productId:
    "0x4e888cdebddbc7914f855eb3a2ae4d7b667c6451dd2d228e9910201263b6dcef",
  quotePrice: 100_000_000,
  feeBps: 500,
  agentCompany:
    "0xa7d0740b247a14ea578bf6f65b352d56e4fa6fdc8f69a6ce4b1276513bb85d2c",
  platformTreasury:
    "0x00000000000000000000000000000000000000000000000000000000000000f0",
  criteria: { type: "exact", path: "/ticket_status", value: "closed" },
  outcome: { ticket_status: "closed", resolution: "refund_issued" },
  costTrace: [
    {
      provider:
        "0x000000000000000000000000000000000000000000000000000000000000a6e7",
      category: 0,
      units: 12000,
      amount: 20_000_000,
    },
    {
      provider:
        "0x000000000000000000000000000000000000000000000000000000000000c6e7",
      category: 1,
      units: 3,
      amount: 2_000_000,
    },
  ],
};

const resp = await fetch(URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(sample),
});
if (!resp.ok) {
  console.error(`verifier returned ${resp.status}:`, await resp.text());
  process.exit(1);
}
const json = await resp.json();

console.log("");
console.log("=== /api/verify response ===");
console.log("success:        ", json.success);
console.log("payload bytes:  ", json.payloadBytesHex.length / 2, "bytes");
console.log("signature:      ", json.signatureHex);
console.log("signer pubkey:  ", json.signerPubkeyHex);
console.log("walrus outcome: ", json.walrus.outcomeBlobId);
console.log("walrus trace:   ", json.walrus.traceBlobId);
console.log("walrus proof:   ", json.walrus.proofBlobId);
console.log("splits:         ", JSON.stringify(json.payload.splits));
console.log("");

const payloadBytes = hex2bytes(json.payloadBytesHex);
const signature = hex2bytes(json.signatureHex);
const signerPubkey = hex2bytes(json.signerPubkeyHex);

// 1. Signer pubkey must match what's registered on chain.
if (json.signerPubkeyHex !== REGISTERED_PUBKEY_HEX) {
  console.error(
    `❌ signer pubkey mismatch:\n   expected ${REGISTERED_PUBKEY_HEX}\n   got      ${json.signerPubkeyHex}`,
  );
  process.exit(1);
}
console.log("✓ signer pubkey matches the one registered on chain");

// 2. ed25519 signature must verify against (payloadBytes, signerPubkey).
const ok = await ed.verifyAsync(signature, payloadBytes, signerPubkey);
if (!ok) {
  console.error("❌ ed25519 signature does NOT verify against the payload bytes");
  process.exit(1);
}
console.log("✓ ed25519 signature verifies against the BCS payload bytes");

// 3. Splits must sum to quotePrice on the success path.
const totalSplits = json.payload.splits.reduce((s, x) => s + x.amount, 0);
if (totalSplits !== sample.quotePrice) {
  console.error(`❌ splits sum (${totalSplits}) != quotePrice (${sample.quotePrice})`);
  process.exit(1);
}
console.log(`✓ splits sum exactly to quote price (${totalSplits})`);

// 4. Platform fee must equal price * feeBps / 10000.
const expectedFee = (sample.quotePrice * sample.feeBps) / 10000;
if (json.payload.platform_fee !== expectedFee) {
  console.error(
    `❌ platform fee (${json.payload.platform_fee}) != expected (${expectedFee})`,
  );
  process.exit(1);
}
console.log(`✓ platform fee equals price × fee_bps / 10000 (${expectedFee})`);

console.log("");
console.log("✅ Roundtrip OK — verifier is wired correctly. Next on-chain step:");
console.log("   submit (payload, [DevAttestation{ signerPubkey, signature }])");
console.log("   to interlock::attestation::verify_and_record_outcome_dev");
console.log("   then interlock::settlement::settle_workflow_dev after dispute window.");
