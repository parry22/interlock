// AES-256-GCM encryption for sensitive at-rest values.
//
// Used for `tenant_settings.signing_secret_encrypted`. The plaintext signing
// secret is encrypted with a server-side master key before INSERT, decrypted
// only at the moment we need it (webhook delivery).
//
// Master key lives in env var SETTINGS_ENCRYPTION_KEY — 32 random bytes
// base64-encoded. Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// Ciphertext format: base64(iv (12 bytes) || ciphertext || authTag (16 bytes))
// — single string for easy column storage.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getMasterKey(): Buffer {
  const b64 = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY not set. Generate one: " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"` " +
        "and add it to .env.local",
    );
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `SETTINGS_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`,
    );
  }
  return key;
}

/** Encrypt a plaintext UTF-8 string. Returns a single base64-encoded blob. */
export function encrypt(plaintext: string): string {
  if (plaintext.length === 0) return "";
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // [iv | ct | tag] → base64
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

/** Decrypt a base64 blob produced by `encrypt`. */
export function decrypt(blob: string): string {
  if (blob.length === 0) return "";
  const key = getMasterKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error("encrypted blob is too short");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf-8");
}

/** True iff SETTINGS_ENCRYPTION_KEY is configured. */
export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.SETTINGS_ENCRYPTION_KEY);
}
