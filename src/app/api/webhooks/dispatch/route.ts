// /api/webhooks/dispatch — drain the pending webhook_deliveries queue.
//
// For each pending (or due-for-retry) delivery:
//   1. Decrypt the tenant's signing secret
//   2. Compute HMAC-SHA256(signing_secret, payload) → X-Interlock-Signature
//   3. POST to webhook_url
//   4. On 2xx → mark delivered
//      On non-2xx or network error → schedule retry with exponential backoff
//
// Triggered by Vercel Cron or the "Run keeper now" button.

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";

import { db, webhookDeliveries, tenantSettings } from "@/lib/db";
import { decrypt } from "@/lib/db/encryption";

export const runtime = "nodejs";
export const maxDuration = 30;

function requireCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

type DeliveryAttempt = {
  id: number;
  status: "delivered" | "retry" | "failed";
  httpStatus?: number;
  error?: string;
};

async function attemptDelivery(
  delivery: typeof webhookDeliveries.$inferSelect,
): Promise<DeliveryAttempt> {
  const d = db();
  // Mark in_flight first to prevent double-delivery if multiple workers run.
  await d
    .update(webhookDeliveries)
    .set({ status: "in_flight" })
    .where(eq(webhookDeliveries.id, delivery.id));

  // Load tenant settings (URL + signing secret).
  const settings = await d
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantAddress, delivery.tenantAddress))
    .limit(1);
  if (settings.length === 0 || !settings[0].webhookUrl) {
    await d
      .update(webhookDeliveries)
      .set({
        status: "failed",
        attempts: delivery.attempts + 1,
        lastError: "tenant has no webhook URL configured",
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    return { id: delivery.id, status: "failed", error: "no webhook URL" };
  }

  const signingSecret = settings[0].signingSecretEncrypted
    ? decrypt(settings[0].signingSecretEncrypted)
    : "";
  const body = JSON.stringify(delivery.payload);
  const signature = signingSecret
    ? createHmac("sha256", signingSecret).update(body).digest("hex")
    : "";

  try {
    const resp = await fetch(settings[0].webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Interlock-Event": delivery.eventType,
        "X-Interlock-Signature": signature,
        "X-Interlock-Delivery-Id": String(delivery.id),
      },
      body,
    });
    if (resp.ok) {
      await d
        .update(webhookDeliveries)
        .set({
          status: "delivered",
          attempts: delivery.attempts + 1,
          deliveredAtMs: Date.now(),
          lastError: null,
        })
        .where(eq(webhookDeliveries.id, delivery.id));
      return { id: delivery.id, status: "delivered", httpStatus: resp.status };
    }
    // Non-2xx → retry with exponential backoff (settings.retryBackoffSeconds × 2^attempts).
    return retry(delivery, settings[0].retryMaxAttempts, settings[0].retryBackoffSeconds, `HTTP ${resp.status}`);
  } catch (e) {
    return retry(
      delivery,
      settings[0].retryMaxAttempts,
      settings[0].retryBackoffSeconds,
      (e as Error).message,
    );
  }
}

async function retry(
  delivery: typeof webhookDeliveries.$inferSelect,
  maxAttempts: number,
  baseBackoff: number,
  error: string,
): Promise<DeliveryAttempt> {
  const d = db();
  const newAttempts = delivery.attempts + 1;
  if (newAttempts >= maxAttempts) {
    await d
      .update(webhookDeliveries)
      .set({ status: "failed", attempts: newAttempts, lastError: error })
      .where(eq(webhookDeliveries.id, delivery.id));
    return { id: delivery.id, status: "failed", error };
  }
  const delayMs = baseBackoff * 1000 * 2 ** delivery.attempts;
  await d
    .update(webhookDeliveries)
    .set({
      status: "pending",
      attempts: newAttempts,
      nextRetryAtMs: Date.now() + delayMs,
      lastError: error,
    })
    .where(eq(webhookDeliveries.id, delivery.id));
  return { id: delivery.id, status: "retry", error };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = requireCron(req);
  if (guard) return guard;
  try {
    const now = Date.now();
    const due = await db()
      .select()
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.status, "pending"),
          or(isNull(webhookDeliveries.nextRetryAtMs), lte(webhookDeliveries.nextRetryAtMs, now)),
        ),
      )
      .limit(20); // batch size per tick
    const results: DeliveryAttempt[] = [];
    for (const d of due) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await attemptDelivery(d));
    }
    return NextResponse.json({
      processed: due.length,
      delivered: results.filter((r) => r.status === "delivered").length,
      retries: results.filter((r) => r.status === "retry").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
