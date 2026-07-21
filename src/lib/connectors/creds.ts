// Credential + config (de)serialization for connections.
//
// Credentials are stored as an AES-256-GCM-encrypted JSON blob using the SAME
// master key + helpers the rest of the app uses (src/lib/db/encryption.ts).
// Plaintext tokens never touch the database.

import { encrypt, decrypt } from "@/lib/db/encryption";

export function encryptCreds(creds: Record<string, unknown>): string {
  return encrypt(JSON.stringify(creds ?? {}));
}

export function decryptCreds(blob: string | null | undefined): Record<string, unknown> {
  if (!blob) return {};
  try {
    const json = decrypt(blob);
    return json ? (JSON.parse(json) as Record<string, unknown>) : {};
  } catch {
    // A decryption failure (rotated/lost key) must not leak — surface empty and
    // let healthCheck fail loudly instead.
    return {};
  }
}

export function encryptSecret(secret: string | null | undefined): string | null {
  return secret ? encrypt(secret) : null;
}

export function decryptSecret(blob: string | null | undefined): string | undefined {
  if (!blob) return undefined;
  try {
    return decrypt(blob);
  } catch {
    return undefined;
  }
}
