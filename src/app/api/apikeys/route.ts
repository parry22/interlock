// /api/apikeys — Postgres-backed developer API key management.
//
// GET    → list (without secrets)
// POST   → mint a new key; returns the raw secret ONCE, stores only sha256
// DELETE → revoke by ?hash=

import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";

import { db, apiKeys, auditLog, type NewApiKey } from "@/lib/db";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

export const runtime = "nodejs";

function genSecret(): string {
  const raw = randomBytes(20).toString("base64url");
  return `wos_${raw}`;
}
function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  try {
    const rows = await db()
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.ownerAddress, effectiveOnChainAddress(user).toLowerCase()))
      .orderBy(desc(apiKeys.createdAtMs));
    return NextResponse.json({
      keys: rows.map((k) => ({
        hash: k.hash,
        label: k.label,
        scopes: k.scopes,
        prefix: k.prefix,
        ownerAddress: k.ownerAddress,
        createdAtMs: k.createdAtMs,
        lastUsedAtMs: k.lastUsedAtMs,
        revokedAtMs: k.revokedAtMs,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  type Body = { label?: string; scopes?: string[] };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  if (!body.label || body.label.length < 1) {
    return NextResponse.json({ error: "label required" }, { status: 400 });
  }

  const secret = genSecret();
  const hash = sha256Hex(secret);
  const record: NewApiKey = {
    hash,
    ownerAddress: effectiveOnChainAddress(user).toLowerCase(),
    label: body.label,
    scopes: body.scopes ?? ["workflows:read", "workflows:write"],
    prefix: secret.slice(0, 10),
    createdAtMs: Date.now(),
    lastUsedAtMs: null,
    revokedAtMs: null,
  };
  try {
    const d = db();
    await d.insert(apiKeys).values(record);
    await d.insert(auditLog).values({
      actorAddress: effectiveOnChainAddress(user).toLowerCase(),
      action: "apikey.generate",
      targetId: hash,
      payload: { label: body.label, scopes: record.scopes, prefix: record.prefix },
      atMs: Date.now(),
    });
    return NextResponse.json({
      secret,
      key: {
        hash: record.hash,
        label: record.label,
        scopes: record.scopes,
        prefix: record.prefix,
        ownerAddress: record.ownerAddress,
        createdAtMs: record.createdAtMs,
        lastUsedAtMs: record.lastUsedAtMs,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const hash = new URL(req.url).searchParams.get("hash");
  if (!hash) return NextResponse.json({ error: "hash query required" }, { status: 400 });
  try {
    const d = db();
    // Verify ownership before revoking — a user can only revoke their own keys.
    const existing = await d.select().from(apiKeys).where(eq(apiKeys.hash, hash)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: "key not found" }, { status: 404 });
    }
    if (existing[0].ownerAddress.toLowerCase() !== effectiveOnChainAddress(user).toLowerCase()) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    // Soft-delete: mark revoked rather than actually drop the row. Keeps audit trail.
    const r = await d
      .update(apiKeys)
      .set({ revokedAtMs: Date.now() })
      .where(eq(apiKeys.hash, hash))
      .returning();
    if (r.length === 0) {
      return NextResponse.json({ error: "key not found" }, { status: 404 });
    }
    await d.insert(auditLog).values({
      actorAddress: r[0].ownerAddress,
      action: "apikey.revoke",
      targetId: hash,
      atMs: Date.now(),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
