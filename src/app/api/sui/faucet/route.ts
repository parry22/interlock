// /api/sui/faucet — top up the signed-in user's wallet with testnet funds.
//
// Grants a sliver of AVAX (gas) from the platform admin wallet and mints demo
// USDC (escrow) to the user's own Avalanche wallet. Lets a user retry funding
// from the sidebar if the auto-top-up at sign-in was skipped or spent.

import { NextResponse } from "next/server";

import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";
import { fundWalletIfNeeded } from "@/lib/interlock/wallets";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request): Promise<NextResponse> {
  const limited = rateLimit(req, "faucet", { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const address = effectiveOnChainAddress(user);

  const result = await fundWalletIfNeeded(address);
  const ok = result.gas !== "error" && result.usdc !== "error";
  return NextResponse.json(
    {
      status: ok ? "funded" : "error",
      address,
      avax: result.gas,
      usdc: result.usdc,
      error: result.gasError ?? result.usdcError,
    },
    { status: ok ? 200 : 502 },
  );
}
