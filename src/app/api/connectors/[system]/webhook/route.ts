// POST /api/connectors/[system]/webhook?c=<connectionId>
//
// Single webhook intake route for every provider. The connection id is carried
// in the `c` query param (we hand each customer a unique webhook URL at connect
// time). Flow:
//   1. Load the connection, confirm it's for this provider.
//   2. Verify the provider-specific signature over the RAW body (never a
//      re-serialized JSON) — reject 401 on failure, nothing is stored.
//   3. Land + process via the shared ingest path (dedupe on sourceEventId).
//
// We always return 2xx once the event is safely landed, even if downstream
// normalization is retried, so providers don't hammer us with redeliveries.

import { NextRequest, NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import { getConnection, toConnection } from "@/lib/db/connectors";
import { getConnector } from "@/lib/connectors/registry";
import { ingestRaw } from "@/lib/connectors/ingest";
import type { RawWebhookRequest } from "@/lib/connectors/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function headersToRecord(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ system: string }> },
): Promise<NextResponse> {
  const limited = rateLimit(req, "connector-webhook", { limit: 600, windowMs: 60_000 });
  if (limited) return limited;

  const { system } = await ctx.params;
  const connectionId = req.nextUrl.searchParams.get("c");
  if (!connectionId) return NextResponse.json({ error: "missing connection id (?c=)" }, { status: 400 });

  const connector = getConnector(system);
  if (!connector) return NextResponse.json({ error: `unknown connector: ${system}` }, { status: 404 });

  const row = await getConnection(connectionId);
  if (!row || row.sourceSystem !== system) {
    return NextResponse.json({ error: "connection not found for this provider" }, { status: 404 });
  }
  const conn = toConnection(row);

  // Raw body is required for signature verification.
  const rawBody = await req.text();
  const rawReq: RawWebhookRequest = { headers: headersToRecord(req), rawBody };

  if (!connector.verifyWebhookSignature(rawReq, conn)) {
    return NextResponse.json({ error: "invalid webhook signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const sourceEventId = connector.sourceEventId(payload);
  if (!sourceEventId) {
    // Nothing to dedupe on → acknowledge but don't store (avoids a null-key row).
    return NextResponse.json({ ok: true, ignored: "no source event id" });
  }

  try {
    const res = await ingestRaw({ connection: conn, connector, sourceEventId, rawPayload: payload });
    return NextResponse.json({ ok: true, deduped: res.deduped, created: res.created });
  } catch (e) {
    // Landing itself failed (DB). Signal a retry to the provider.
    return NextResponse.json({ error: `ingest failed: ${(e as Error).message}` }, { status: 503 });
  }
}
