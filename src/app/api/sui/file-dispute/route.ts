// /api/sui/file-dispute — file a dispute on a Verified workflow.
//
// Flow:
//   1. Receive { workflowId, evidenceText }
//   2. Upload evidence text to Walrus → blob ID
//   3. Submit WeaveosCore.fileDispute signed by the user's own wallet
//
// The workflow's customer must be the signed-in user (the contract enforces
// this too — only the customer can dispute their own workflow).

import { NextRequest, NextResponse } from "next/server";

import { fileDispute } from "@/lib/interlock/lifecycle";
import { walrusPut } from "@/lib/interlock/walrus";
import { getCurrentUser } from "@/lib/interlock/session";
import { getUserWallet } from "@/lib/interlock/wallets";
import { explorerTxUrl } from "@/lib/interlock/evm";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = rateLimit(req, "file-dispute", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  type Body = { workflowId?: string; evidenceText?: string };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  if (!body.workflowId) {
    return NextResponse.json({ error: "workflowId required" }, { status: 400 });
  }
  const evidenceText = body.evidenceText?.trim();
  if (!evidenceText || evidenceText.length < 5) {
    return NextResponse.json({ error: "evidenceText required (min 5 chars)" }, { status: 400 });
  }

  try {
    // 1. Upload evidence to Walrus.
    const blob = await walrusPut(
      JSON.stringify({ filedAtMs: Date.now(), workflowId: body.workflowId, evidenceText }),
    );

    // 2. Submit on-chain dispute signed by the user's own wallet.
    const wallet = await getUserWallet(user.sub);
    const r = await fileDispute(wallet, {
      workflowId: body.workflowId,
      evidenceBlobId: blob.blobId,
    });

    return NextResponse.json({
      txHash: r.txHash,
      evidenceBlobId: blob.blobId,
      explorer: explorerTxUrl(r.txHash),
    });
  } catch (e) {
    return NextResponse.json({ error: `dispute failed: ${(e as Error).message}` }, { status: 500 });
  }
}
