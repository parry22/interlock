// /api/me — returns the current user for the client UI, and heals the session.
//
// The sidebar chip calls this on mount. Accounts created before per-user
// wallets existed have no wallet address in their cookie, which would break
// every wallet-scoped read. Here we resolve (and provision, if missing) the
// user's wallet from the database, refresh the identity cookie so subsequent
// requests are correctly scoped, and best-effort fund a freshly made wallet.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  INTERLOCK_USER_COOKIE,
  getCurrentUser,
  serializeUserCookie,
  userCookieOptions,
} from "@/lib/interlock/session";
import { resolveWalletAddress, fundWalletIfNeeded } from "@/lib/interlock/wallets";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });

  // Authoritative wallet address from the DB (provisioned if the account
  // predates wallets). Falls back to whatever the cookie had on error.
  let walletAddress = user.walletAddress;
  try {
    const resolved = await resolveWalletAddress(user.sub);
    if (resolved !== user.walletAddress) {
      walletAddress = resolved;
      // Heal the cookie so getCurrentUser()-based scoping is correct next time.
      const store = await cookies();
      store.set(
        INTERLOCK_USER_COOKIE,
        serializeUserCookie({ ...user, walletAddress }),
        userCookieOptions(),
      );
      // A brand-new wallet needs gas + demo USDC to be usable.
      fundWalletIfNeeded(walletAddress).catch(() => undefined);
    }
  } catch {
    // keep the cookie value on any DB/chain hiccup
  }

  return NextResponse.json({
    user: { ...user, walletAddress, suiAddress: walletAddress ?? user.sub },
  });
}
