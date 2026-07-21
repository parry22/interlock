// Dual auth resolver — accepts either the Google session cookie or an
// `Authorization: Bearer wos_…` API key, returns a unified caller identity.
//
// Used by every endpoint that should be reachable by BOTH a human (signed in
// via Google) AND an autonomous agent (using an API key minted on /developer).
// One auth path, no duplicated logic in the route handlers.

import { createHash } from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";

import { db, apiKeys } from "@/lib/db";
import {
  effectiveOnChainAddress,
  getCurrentUser,
  type UserSession,
} from "@/lib/interlock/session";

export type CallerIdentity = {
  /** Underlying user record (Google identity, when present). */
  user: UserSession | null;
  /** Address used for on-chain scoping + signing. */
  onChainAddress: string;
  /** How the request was authenticated. */
  via: "cookie" | "apikey";
  /** Hash of the api_key row that authorised this call (apikey only). */
  apiKeyHash?: string;
};

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Resolve the caller. Returns null if neither auth method succeeds.
 *
 * Cookie path: reads `interlock.user` via getCurrentUser().
 * API key path: SHA-256s the bearer token, looks it up in api_keys, requires
 * the key not be revoked. Bumps `lastUsedAtMs` on success (best-effort).
 */
export async function resolveCaller(req: Request): Promise<CallerIdentity | null> {
  // 1. Bearer token wins when present — agents almost never send cookies, and
  //    explicit beats implicit when both are set.
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    const hash = sha256Hex(token);
    const rows = await db()
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.hash, hash), isNull(apiKeys.revokedAtMs)))
      .limit(1);
    if (rows.length === 0) return null;
    // Best-effort touch-up; failures here shouldn't block the call.
    db()
      .update(apiKeys)
      .set({ lastUsedAtMs: Date.now() })
      .where(eq(apiKeys.hash, hash))
      .catch(() => {
        /* ignore */
      });
    return {
      user: null,
      onChainAddress: rows[0].ownerAddress,
      via: "apikey",
      apiKeyHash: hash,
    };
  }

  // 2. Cookie fallback for browsers.
  const user = await getCurrentUser();
  if (!user) return null;
  return {
    user,
    onChainAddress: effectiveOnChainAddress(user),
    via: "cookie",
  };
}
