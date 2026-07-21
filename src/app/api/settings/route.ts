// /api/settings — Postgres-backed per-tenant runtime config.
//
// Signing secrets are AES-256-GCM encrypted at rest with SETTINGS_ENCRYPTION_KEY.
//
// GET ?address=0x… → fetch settings for the tenant (returns plaintext secret)
// POST              → upsert settings; auto-generates signing secret on first save

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { db, tenantSettings, auditLog, type NewTenantSettings } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/db/encryption";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

export const runtime = "nodejs";

const isAddr = (s: unknown): s is string =>
  typeof s === "string" && /^0x[0-9a-fA-F]{2,64}$/.test(s);

const DEFAULT_RETRY = { maxAttempts: 5, backoffSeconds: 30 };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  // Allow ?address=… for parity with the existing client, but ignore it and
  // always serve the signed-in user's own settings. This prevents a stale
  // client from reading another tenant's webhook config.
  const addr = effectiveOnChainAddress(user);
  try {
    const rows = await db()
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantAddress, addr.toLowerCase()))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json({
        settings: {
          tenantAddress: addr,
          webhookUrl: "",
          signingSecret: "",
          topics: [],
          retryPolicy: DEFAULT_RETRY,
          updatedAtMs: 0,
        },
      });
    }
    const r = rows[0];
    return NextResponse.json({
      settings: {
        tenantAddress: r.tenantAddress,
        webhookUrl: r.webhookUrl,
        // Decrypt the signing secret for client display (over TLS only).
        signingSecret: r.signingSecretEncrypted ? decrypt(r.signingSecretEncrypted) : "",
        topics: r.topics,
        retryPolicy: { maxAttempts: r.retryMaxAttempts, backoffSeconds: r.retryBackoffSeconds },
        updatedAtMs: r.updatedAtMs,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  type Body = {
    webhookUrl?: string;
    signingSecret?: string;
    topics?: string[];
    retryPolicy?: { maxAttempts: number; backoffSeconds: number };
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  // Tenant is always the signed-in user; the body cannot override it.
  const tenantAddress = effectiveOnChainAddress(user).toLowerCase();
  const d = db();
  const existing = await d
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantAddress, tenantAddress))
    .limit(1);

  // Either keep the existing secret, accept a new one from the client, or
  // auto-generate one on first save.
  const newSecret =
    body.signingSecret ??
    (existing[0]?.signingSecretEncrypted
      ? decrypt(existing[0].signingSecretEncrypted)
      : `whsec_${randomBytes(24).toString("base64url")}`);

  const record: NewTenantSettings = {
    tenantAddress,
    webhookUrl: body.webhookUrl ?? existing[0]?.webhookUrl ?? "",
    signingSecretEncrypted: encrypt(newSecret),
    topics: body.topics ?? existing[0]?.topics ?? [],
    retryMaxAttempts: body.retryPolicy?.maxAttempts ?? existing[0]?.retryMaxAttempts ?? DEFAULT_RETRY.maxAttempts,
    retryBackoffSeconds:
      body.retryPolicy?.backoffSeconds ?? existing[0]?.retryBackoffSeconds ?? DEFAULT_RETRY.backoffSeconds,
    updatedAtMs: Date.now(),
  };
  try {
    await d
      .insert(tenantSettings)
      .values(record)
      .onConflictDoUpdate({
        target: tenantSettings.tenantAddress,
        set: {
          webhookUrl: record.webhookUrl,
          signingSecretEncrypted: record.signingSecretEncrypted,
          topics: record.topics,
          retryMaxAttempts: record.retryMaxAttempts,
          retryBackoffSeconds: record.retryBackoffSeconds,
          updatedAtMs: record.updatedAtMs,
        },
      });
    await d.insert(auditLog).values({
      actorAddress: tenantAddress,
      action: existing.length > 0 ? "settings.update" : "settings.create",
      targetId: tenantAddress,
      payload: { webhookUrl: record.webhookUrl, topics: record.topics },
      atMs: Date.now(),
    });
    return NextResponse.json({
      settings: {
        tenantAddress: record.tenantAddress,
        webhookUrl: record.webhookUrl,
        signingSecret: newSecret,
        topics: record.topics,
        retryPolicy: { maxAttempts: record.retryMaxAttempts, backoffSeconds: record.retryBackoffSeconds },
        updatedAtMs: record.updatedAtMs,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
