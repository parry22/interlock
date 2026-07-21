// GET /api/connectors/health?c=<connectionId>  → health-check one connection
// GET /api/connectors/health                     → health-check all active
//
// Runs the connector's healthCheck against live provider credentials and
// records the result on the connection row (status + lastHealthyAtMs).

import { NextRequest, NextResponse } from "next/server";

import { getConnection, listActiveConnections, toConnection, setConnectionHealth } from "@/lib/db/connectors";
import { getConnector } from "@/lib/connectors/registry";

export const runtime = "nodejs";

async function checkOne(rowId: string) {
  const row = await getConnection(rowId);
  if (!row) return { connectionId: rowId, healthy: false, detail: "not found" };
  const connector = getConnector(row.sourceSystem);
  if (!connector) return { connectionId: rowId, healthy: false, detail: "no connector" };
  const res = await connector.healthCheck(toConnection(row));
  await setConnectionHealth(row.id, res.healthy, res.detail);
  return { connectionId: row.id, sourceSystem: row.sourceSystem, ...res };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const c = req.nextUrl.searchParams.get("c");
  try {
    if (c) return NextResponse.json(await checkOne(c));
    const rows = await listActiveConnections();
    const results = [];
    for (const row of rows) results.push(await checkOne(row.id));
    return NextResponse.json({ checked: results.length, results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
