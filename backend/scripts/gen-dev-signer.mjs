#!/usr/bin/env node
// Generate an ed25519 keypair for the hackathon-mode mock verifier.
//
// Usage:
//   node backend/scripts/gen-dev-signer.mjs
//
// Output:
//   - .env.local entry: INTERLOCK_DEV_SIGNER_PRIVKEY=<hex>
//   - backend/move/deployments/dev-signer.json with public key for registration

import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

// Node returns DER-encoded keys for ed25519. We need the raw 32-byte seed
// (private key) and 32-byte public key for Sui ed25519 + libraries like noble.
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

// PKCS8 DER for ed25519 private keys ends with the 32-byte seed at offset 16.
const privDer = privateKey.export({ format: "der", type: "pkcs8" });
const privSeed = privDer.subarray(privDer.length - 32);

// SPKI DER for ed25519 public keys ends with the 32-byte pubkey at offset 12.
const pubDer = publicKey.export({ format: "der", type: "spki" });
const pubRaw = pubDer.subarray(pubDer.length - 32);

const privHex = privSeed.toString("hex");
const pubHex = pubRaw.toString("hex");

console.log("=== Interlock dev signer keypair ===");
console.log();
console.log("Private (HEX, 32 bytes) — KEEP SECRET, add to .env.local:");
console.log(`INTERLOCK_DEV_SIGNER_PRIVKEY=${privHex}`);
console.log();
console.log("Public  (HEX, 32 bytes) — register on-chain via registry::allow_dev_signer:");
console.log(`0x${pubHex}`);
console.log();

// Write deployment metadata
const out = {
  generatedAt: new Date().toISOString(),
  pubkeyHex: pubHex,
  pubkeyForMoveArg: `0x${pubHex}`,
  registrationCommand: [
    "sui client call",
    "  --package <PACKAGE_ID>",
    "  --module registry",
    "  --function allow_dev_signer",
    "  --args <ADMIN_CAP> <PRODUCT_ID> 0x" + pubHex,
    "  --gas-budget 50000000",
  ].join("\n"),
  notes: [
    "Private key (INTERLOCK_DEV_SIGNER_PRIVKEY) lives in .env.local only — gitignored.",
    "The /api/verify route reads this env var and signs AttestationPayload bytes with it.",
    "The Move verify_dev_attestations function uses the pubkey to verify.",
    "To rotate: re-run this script, register the new pubkey, then revoke the old one.",
  ],
};
const outPath = join(process.cwd(), "backend/move/deployments/dev-signer.json");
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${outPath}`);
