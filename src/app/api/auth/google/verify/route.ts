// /api/auth/google/verify — verify a Google id_token and establish a session.
//
// Client posts: { idToken, nonce }
//
// Server verifies the JWT's RS256 signature against Google's published JWKS,
// checks issuer/audience/nonce, then trusts the claims (sub, email, name,
// picture) for identity. No wallet or keypair is derived — this is plain
// OAuth, not zkLogin. On-chain actions continue to run through the
// platform-configured signer (see effectiveOnChainAddress in session.ts).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq } from "drizzle-orm";

import { GOOGLE_AUTH_CONFIG, decodeJwtClaims } from "@/lib/interlock/google";
import {
  INTERLOCK_USER_COOKIE,
  effectiveOnChainAddress,
  serializeUserCookie,
  userCookieOptions,
  type UserSession,
} from "@/lib/interlock/session";
import { db, users, auditLog, type NewUser } from "@/lib/db";
import { getOrCreateUserWallet, fundWalletIfNeeded } from "@/lib/interlock/wallets";

// Google's published JWK set — used to verify id_token signatures.
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const runtime = "nodejs";
export const maxDuration = 15;

type VerifyRequest = {
  idToken: string;
  nonce: string;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: VerifyRequest;
  try {
    body = (await req.json()) as VerifyRequest;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  if (!body.idToken || !body.nonce) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  try {
    // 1. Verify the JWT's RS256 signature against Google's published JWKS
    //    before we accept any of its claims as truth.
    let payload;
    try {
      const result = await jwtVerify(body.idToken, GOOGLE_JWKS, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: GOOGLE_AUTH_CONFIG.clientId,
      });
      payload = result.payload;
    } catch (e) {
      return NextResponse.json(
        { error: `JWT verification failed: ${(e as Error).message}` },
        { status: 401 },
      );
    }

    // 2. Nonce must match what the client generated before the redirect —
    //    otherwise a stolen/replayed id_token from elsewhere could be reused.
    if (payload.nonce !== body.nonce) {
      return NextResponse.json({ error: "nonce mismatch" }, { status: 401 });
    }
    if (!payload.sub) {
      return NextResponse.json({ error: "id_token missing sub claim" }, { status: 401 });
    }

    // 3. Pull display claims (email, name, picture) for the UI.
    const claims = decodeJwtClaims(body.idToken);

    // 4. Persist (or refresh) the user record. Tracks first/last seen +
    //    Google profile claims. Writes an audit_log entry on first sign-in.
    const sub = payload.sub;
    let walletAddress: string | undefined;
    try {
      const d = db();
      const existing = await d.select().from(users).where(eq(users.googleSub, sub)).limit(1);
      if (existing.length === 0) {
        const newUser: NewUser = {
          googleSub: sub,
          email: claims.email,
          name: claims.name,
          picture: claims.picture,
        };
        await d.insert(users).values(newUser);
      } else {
        await d
          .update(users)
          .set({
            lastSeenAt: new Date(),
            email: claims.email ?? existing[0].email,
            name: claims.name ?? existing[0].name,
            picture: claims.picture ?? existing[0].picture,
          })
          .where(eq(users.googleSub, sub));
      }

      // Provision the user's own Avalanche wallet (idempotent) so their
      // workflows are created by, and refunded to, THEIR address.
      try {
        const w = await getOrCreateUserWallet(sub);
        walletAddress = w.address;
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[auth] wallet provision failed:", (e as Error).message);
      }

      const actorAddress = effectiveOnChainAddress({ sub, walletAddress });
      await d.insert(auditLog).values({
        actorAddress,
        action: existing.length === 0 ? "user.signup" : "user.signin",
        targetId: sub,
        payload: existing.length === 0 ? { email: claims.email } : undefined,
        atMs: Date.now(),
      });
    } catch (e) {
      // Persistence is best-effort; don't fail the login.
      // eslint-disable-next-line no-console
      console.warn("[auth] persist user failed:", (e as Error).message);
    }

    // Best-effort testnet top-up (AVAX gas + demo USDC) so the user can run a
    // workflow immediately. Never blocks sign-in.
    let funding: Awaited<ReturnType<typeof fundWalletIfNeeded>> | undefined;
    if (walletAddress) {
      try {
        funding = await fundWalletIfNeeded(walletAddress);
      } catch {
        /* ignore */
      }
    }

    // 5. Set the identity cookie so server components + proxy can identify
    //    this user on subsequent requests. The cookie holds *only* public
    //    identity (sub, profile, public wallet address). No keys, no tokens.
    const sessionPayload: UserSession = {
      sub,
      email: claims.email,
      name: claims.name,
      picture: claims.picture,
      walletAddress,
    };
    const cookieStore = await cookies();
    cookieStore.set(INTERLOCK_USER_COOKIE, serializeUserCookie(sessionPayload), userCookieOptions());

    return NextResponse.json({
      sub,
      email: claims.email,
      name: claims.name,
      picture: claims.picture,
      walletAddress,
      funding,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `verify failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
