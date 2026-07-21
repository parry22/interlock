// Reversal-window cron — the generic gaming-protection job.
//
// Finalizes every provisional outcome event whose reversalWindowExpiresAt has
// elapsed, UNLESS a reversing event (termination / refund / dispute) arrived for
// the same (customer, entity) within the window. Fully vertical-agnostic: it
// operates on any event with a reversal window, so recruiting (90-day retention)
// and field service (payment/grace) share one code path. See
// src/lib/connectors/reversal.ts.

import { NextRequest, NextResponse } from "next/server";

import { finalizeDueEvents } from "@/lib/connectors/reversal";

export const runtime = "nodejs";
export const maxDuration = 60;

function requireCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return req.headers.get("authorization") === `Bearer ${secret}`
    ? null
    : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const unauth = requireCron(req);
  if (unauth) return unauth;
  const result = await finalizeDueEvents();
  return NextResponse.json(result);
}
export async function GET(req: NextRequest): Promise<NextResponse> {
  const unauth = requireCron(req);
  if (unauth) return unauth;
  // GET is a safe dry-run-ish trigger too (idempotent), used by the demo button.
  const result = await finalizeDueEvents();
  return NextResponse.json(result);
}
