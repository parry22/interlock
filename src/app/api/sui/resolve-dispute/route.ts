// /api/sui/resolve-dispute — admin arbitration for a filed dispute.
//
// Only the platform admin can resolve. Two outcomes:
//   refundCustomer=true  → dispute upheld, customer refunded in full
//   refundCustomer=false → dispute dismissed, workflow returns to Verified
//                          so settlement can proceed
//
// Without this, a filed dispute freezes the escrow forever (settlement
// requires zero open disputes). This is the MVP arbitration path; Phase 2
// replaces the admin with an attested arbitrator.

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser, effectiveOnChainAddress } from "@/lib/interlock/session";
import { resolveDispute, walletFromHex } from "@/lib/interlock/lifecycle";
import { registryContract, explorerTxUrl } from "@/lib/interlock/evm";
import { interlockSecrets } from "@/lib/interlock/config";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Lightweight "am I the admin?" check so the UI can show/hide admin controls. */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ isAdmin: false });
  try {
    const adminAddr = (await registryContract().admin()).toLowerCase();
    return NextResponse.json({ isAdmin: effectiveOnChainAddress(user).toLowerCase() === adminAddr });
  } catch {
    return NextResponse.json({ isAdmin: false });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = rateLimit(req, "resolve-dispute", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  // Gate to the on-chain admin so a normal user can't call this.
  const adminAddr = (await registryContract().admin()).toLowerCase();
  if (effectiveOnChainAddress(user).toLowerCase() !== adminAddr) {
    return NextResponse.json({ error: "only the platform admin can resolve disputes" }, { status: 403 });
  }

  type Body = { workflowId?: string; refundCustomer?: boolean };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  if (!body.workflowId) {
    return NextResponse.json({ error: "workflowId required" }, { status: 400 });
  }

  try {
    const admin = walletFromHex(interlockSecrets.adminPrivkey);
    const r = await resolveDispute(admin, {
      workflowId: body.workflowId,
      refundCustomer: Boolean(body.refundCustomer),
    });
    return NextResponse.json({
      txHash: r.txHash,
      refunded: Boolean(body.refundCustomer),
      explorer: explorerTxUrl(r.txHash),
    });
  } catch (e) {
    return NextResponse.json({ error: `resolve failed: ${(e as Error).message}` }, { status: 500 });
  }
}
