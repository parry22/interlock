// Inbound retry drain cron. Picks up inbound_events that are pending or due for
// retry (failed_retryable with nextRetryAtMs elapsed) and reprocesses them
// through the shared ingest path. This is what guarantees "never silently drop":
// a normalization/DB failure at webhook time is retried here with exponential
// backoff until it succeeds or hits the attempt cap.

import { NextRequest, NextResponse } from "next/server";

import { claimDueInboundEvents } from "@/lib/db/connectors";
import { processInboundEvent } from "@/lib/connectors/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH = 50;

function requireCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return req.headers.get("authorization") === `Bearer ${secret}`
    ? null
    : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

async function run(): Promise<NextResponse> {
  const due = await claimDueInboundEvents(BATCH);
  let processed = 0;
  let retried = 0;
  let failed = 0;
  for (const row of due) {
    const res = await processInboundEvent(row.id);
    if (res.status === "processed") processed++;
    else if (res.status === "retry") retried++;
    else if (res.status === "failed") failed++;
  }
  return NextResponse.json({ claimed: due.length, processed, retried, failed });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const unauth = requireCron(req);
  if (unauth) return unauth;
  return run();
}
export async function GET(req: NextRequest): Promise<NextResponse> {
  const unauth = requireCron(req);
  if (unauth) return unauth;
  return run();
}
