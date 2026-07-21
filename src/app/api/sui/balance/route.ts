// /api/sui/balance — the signed-in user's on-chain balances.
//
// Returns AVAX (for gas) and USDC (for escrow) on Avalanche Fuji, so the
// sidebar can tell the user at a glance whether they can run a workflow.
// (Path kept as /api/sui/* for now to avoid churning frontend fetches; the
//  chain underneath is Avalanche.)

import { NextResponse } from "next/server";
import { ethers } from "ethers";

import { getProvider, usdcContract, evmConfig } from "@/lib/interlock/evm";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const address = effectiveOnChainAddress(user);

  try {
    const [avaxWei, usdcUnits] = await Promise.all([
      getProvider().getBalance(address),
      usdcContract().balanceOf(address) as Promise<bigint>,
    ]);
    return NextResponse.json({
      address,
      avax: ethers.formatEther(avaxWei),
      avaxWei: avaxWei.toString(),
      usdc: ethers.formatUnits(usdcUnits, evmConfig.usdcDecimals),
      usdcUnits: usdcUnits.toString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `balance fetch failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
