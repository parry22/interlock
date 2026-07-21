// Google OAuth config + JWT claim decoding.
//
// Plain OAuth: the user signs in with Google, we verify the returned id_token
// against Google's published JWKS server-side, and trust the claims (sub,
// email, name, picture) for identity. No wallet is derived from the JWT —
// on-chain actions run through the platform-configured signer
// (see `effectiveOnChainAddress` in ./session.ts).

export const GOOGLE_AUTH_CONFIG = {
  /** Google OAuth Client ID — public, safe to expose to the browser. */
  clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  /** Redirect URL Google sends the id_token to. */
  redirectUri:
    typeof window === "undefined"
      ? "http://localhost:3000/auth/google/callback"
      : `${window.location.origin}/auth/google/callback`,
} as const;

/** Decode a JWT payload without verifying the signature (signature is
 * verified server-side in /api/auth/google/verify; here we just want the
 * claims for UI display). */
export function decodeJwtClaims(jwt: string): {
  iss: string;
  sub: string;
  aud: string;
  email?: string;
  name?: string;
  picture?: string;
  nonce?: string;
  iat: number;
  exp: number;
} {
  const parts = jwt.split(".");
  if (parts.length < 2) throw new Error("malformed JWT");
  // base64url → standard base64 → JSON
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), "=");
  const json = (typeof atob !== "undefined")
    ? atob(b64)
    : Buffer.from(b64, "base64").toString("utf-8");
  return JSON.parse(json);
}
