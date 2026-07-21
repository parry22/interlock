// /api/audit-log — recent platform activity (immutable).
//
// Optional filters via query params:
//   ?actor=0x...    only entries by this address
//   ?action=...     only entries matching this action (e.g. "apikey.generate")
//   ?limit=50       default 50, max 200

import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";

import { db, auditLog } from "@/lib/db";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  try {
    // Always scope to the current user — ignore any ?actor= override.
    // Audit logs are immutable but they reveal what each user did; only their
    // own entries should be visible.
    const conds = [eq(auditLog.actorAddress, effectiveOnChainAddress(user).toLowerCase())];
    if (action) conds.push(eq(auditLog.action, action));
    const rows = await db()
      .select()
      .from(auditLog)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(auditLog.atMs))
      .limit(limit);
    return NextResponse.json({ entries: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
