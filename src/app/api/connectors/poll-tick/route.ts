// Polling fallback cron. For every active connection, ask its connector to
// fetch events since the connection's poll cursor; each raw event flows through
// the SAME land→normalize→reversal path as a webhook. Per-connection failures
// are isolated (one bad connection doesn't stall the rest) and flip that
// connection to status=error.
//
// Providers that are poll-primary (ServiceTitan) rely on this entirely;
// webhook-primary providers use it only as a backstop.

import { NextRequest, NextResponse } from "next/server";

import { listActiveConnections, toConnection, setPollCursor, setConnectionHealth } from "@/lib/db/connectors";
import { getConnector } from "@/lib/connectors/registry";
import { ingestRaw } from "@/lib/connectors/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

function requireCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return req.headers.get("authorization") === `Bearer ${secret}`
    ? null
    : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000; // 1h if no cursor yet

async function run(): Promise<NextResponse> {
  const connections = await listActiveConnections();
  const report: Array<{ connectionId: string; sourceSystem: string; polled: number; created: number; error?: string }> = [];

  for (const row of connections) {
    const connector = getConnector(row.sourceSystem);
    if (!connector) continue;
    const conn = toConnection(row);
    const since = conn.pollCursorMs ?? Date.now() - DEFAULT_LOOKBACK_MS;
    const startedAt = Date.now();
    try {
      const raws = await connector.poll(conn, since);
      let created = 0;
      for (const r of raws) {
        const res = await ingestRaw({ connection: conn, connector, sourceEventId: r.sourceEventId, rawPayload: r.payload });
        created += res.created;
      }
      await setPollCursor(row.id, startedAt);
      if (raws.length > 0) await setConnectionHealth(row.id, true);
      report.push({ connectionId: row.id, sourceSystem: row.sourceSystem, polled: raws.length, created });
    } catch (e) {
      await setConnectionHealth(row.id, false, (e as Error).message);
      report.push({ connectionId: row.id, sourceSystem: row.sourceSystem, polled: 0, created: 0, error: (e as Error).message });
    }
  }
  return NextResponse.json({ connections: connections.length, report });
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
