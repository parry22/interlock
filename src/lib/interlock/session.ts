// Server-side session helpers.
//
// Plain Google OAuth identity: the id_token is verified server-side against
// Google's JWKS in /api/auth/google/verify, and the resulting claims
// (sub, email, name, picture) are stored in a cookie. No wallet or keypair
// is derived from the JWT.
//
// The cookie is what server components, proxy.ts, and API routes read to know
// who the request belongs to. It is NOT a credential — we never use it to sign
// transactions, only to filter reads to "your data" and to attribute audit
// log entries. Spoofing the cookie at most lets you see another user's
// *public* on-chain data (which is already public), not act as them.
//
// Why not httpOnly: we never need the cookie value in JS, but keeping it readable
// makes client-side sign-out trivial. Tradeoff is fine for this scope.

import { cookies } from "next/headers";

export const INTERLOCK_USER_COOKIE = "interlock.user";

/** Identity payload stored in the cookie. No secrets. */
export type UserSession = {
  /** Google subject ID — stable across sign-ins. The tenant key everywhere. */
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  /** The user's own custodial wallet address on Avalanche. Public, not a secret. */
  walletAddress?: string;
};

/** Decode a cookie value. Returns null on any parse failure. */
export function parseUserCookie(raw: string | undefined): UserSession | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (
      obj &&
      typeof obj === "object" &&
      typeof (obj as UserSession).sub === "string"
    ) {
      return obj as UserSession;
    }
    return null;
  } catch {
    return null;
  }
}

/** Encode a session for storage in a cookie. */
export function serializeUserCookie(user: UserSession): string {
  return encodeURIComponent(JSON.stringify(user));
}

/** Read the current user from the request cookies. Null when signed out. */
export async function getCurrentUser(): Promise<UserSession | null> {
  const store = await cookies();
  const c = store.get(INTERLOCK_USER_COOKIE);
  return parseUserCookie(c?.value);
}

/** Cookie set options — 30 days, lax samesite, secure in prod. */
export function userCookieOptions(): {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

/**
 * The user's own on-chain address — their custodial wallet on Avalanche.
 *
 * This is the address that creates their workflows, holds their escrow, and
 * receives their refunds, and it's the tenant key for their API keys and
 * customer records. Each user gets a distinct wallet at sign-in, so data is
 * genuinely isolated per user (no shared platform address).
 *
 * Prefers the wallet address baked into the session cookie; falls back to the
 * lowercased Google `sub` only for pre-wallet rows (shouldn't happen after the
 * wallet migration, but keeps reads from throwing).
 */
export function effectiveOnChainAddress(user: UserSession): string {
  return (user.walletAddress ?? user.sub).toLowerCase();
}
