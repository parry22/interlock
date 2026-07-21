// /api/keeper/index-tick — run one indexer pass.
//
// Vercel Cron triggers this hourly (per vercel.json). Also callable manually
// via the "Refresh indexer" button on /settings.
//
// Auth: optional Bearer CRON_SECRET. Open in local dev.

import { NextRequest, NextResponse } from "next/server";
import { runIndexerTick } from "@/lib/db/indexer";

export const runtime = "nodejs";
export const maxDuration = 60;

function requireCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = requireCron(req);
  if (guard) return guard;
  try {
    const result = await runIndexerTick();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: `indexer failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // GET also runs the tick — Vercel Cron uses GET by default.
  return POST(req);
}
