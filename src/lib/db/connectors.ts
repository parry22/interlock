// Data access for the connector framework. Persistence only — normalization,
// signature verification, and reversal logic live in src/lib/connectors/*.

import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db, schema } from "./index";
import type { Connection, ConnectionConfig } from "@/lib/connectors/types";
import { decryptCreds, decryptSecret } from "@/lib/connectors/creds";

export type ConnectionRow = typeof schema.connectorConnections.$inferSelect;
export type InboundEventRow = typeof schema.inboundEvents.$inferSelect;
export type OutcomeEventRow = typeof schema.outcomeEvents.$inferSelect;

// === Connections ===

export async function getConnection(id: string): Promise<ConnectionRow | null> {
  const rows = await db()
    .select()
    .from(schema.connectorConnections)
    .where(eq(schema.connectorConnections.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listActiveConnections(sourceSystem?: string): Promise<ConnectionRow[]> {
  const base = db().select().from(schema.connectorConnections);
  return sourceSystem
    ? base.where(
        and(
          eq(schema.connectorConnections.status, "active"),
          eq(schema.connectorConnections.sourceSystem, sourceSystem),
        ),
      )
    : base.where(eq(schema.connectorConnections.status, "active"));
}

/** Decrypt a stored connection row into the runtime `Connection` handed to
 *  connector methods. */
export function toConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    customerId: row.customerId,
    sourceSystem: row.sourceSystem,
    authKind: row.authKind as "oauth" | "api_key",
    creds: decryptCreds(row.credsEncrypted),
    webhookSecret: decryptSecret(row.webhookSecretEncrypted),
    config: (row.config ?? {}) as ConnectionConfig,
    pollCursorMs: row.pollCursorMs,
  };
}

export async function createConnection(input: {
  customerId: string;
  sourceSystem: string;
  authKind: "oauth" | "api_key";
  credsEncrypted: string;
  webhookSecretEncrypted?: string | null;
  config?: Record<string, unknown>;
  displayName?: string;
}): Promise<ConnectionRow> {
  const now = Date.now();
  const [row] = await db()
    .insert(schema.connectorConnections)
    .values({
      id: `conn_${randomUUID()}`,
      customerId: input.customerId,
      sourceSystem: input.sourceSystem,
      authKind: input.authKind,
      credsEncrypted: input.credsEncrypted,
      webhookSecretEncrypted: input.webhookSecretEncrypted ?? null,
      config: input.config ?? {},
      displayName: input.displayName ?? null,
      status: "active",
      createdAtMs: now,
      updatedAtMs: now,
    })
    .returning();
  return row;
}

export async function setConnectionHealth(
  id: string,
  healthy: boolean,
  detail?: string,
): Promise<void> {
  const now = Date.now();
  await db()
    .update(schema.connectorConnections)
    .set(
      healthy
        ? { status: "active", lastError: null, lastHealthyAtMs: now, updatedAtMs: now }
        : { status: "error", lastError: detail ?? "health check failed", updatedAtMs: now },
    )
    .where(eq(schema.connectorConnections.id, id));
}

export async function setPollCursor(id: string, cursorMs: number): Promise<void> {
  await db()
    .update(schema.connectorConnections)
    .set({ pollCursorMs: cursorMs, updatedAtMs: Date.now() })
    .where(eq(schema.connectorConnections.id, id));
}

// === Inbound events (landing + idempotency + retry state machine) ===

/** Land a raw delivery. Idempotent on (connectionId, sourceEventId): a replay
 *  returns { deduped: true } and inserts nothing new. Returns the row id to
 *  process. */
export async function landInboundEvent(input: {
  connectionId: string;
  sourceSystem: string;
  sourceEventId: string;
  rawPayload: unknown;
}): Promise<{ id: number | null; deduped: boolean }> {
  const now = Date.now();
  const inserted = await db()
    .insert(schema.inboundEvents)
    .values({
      connectionId: input.connectionId,
      sourceSystem: input.sourceSystem,
      sourceEventId: input.sourceEventId,
      rawPayload: input.rawPayload as object,
      status: "pending",
      receivedAtMs: now,
    })
    .onConflictDoNothing({
      target: [schema.inboundEvents.connectionId, schema.inboundEvents.sourceEventId],
    })
    .returning({ id: schema.inboundEvents.id });
  if (inserted.length === 0) return { id: null, deduped: true };
  return { id: inserted[0].id, deduped: false };
}

export async function getInboundEvent(id: number): Promise<InboundEventRow | null> {
  const rows = await db().select().from(schema.inboundEvents).where(eq(schema.inboundEvents.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Claim due-for-processing inbound events (pending, or failed-but-retry-due),
 *  atomically flipping them to in_flight so parallel cron runs don't double
 *  process. */
export async function claimDueInboundEvents(limit: number): Promise<InboundEventRow[]> {
  const now = Date.now();
  // Two-step claim (select ids, then guarded update) — Drizzle has no
  // RETURNING-on-update-with-subquery-limit sugar, and this is the same shape
  // the webhook_deliveries drainer uses.
  const due = await db()
    .select()
    .from(schema.inboundEvents)
    .where(
      and(
        or(
          eq(schema.inboundEvents.status, "pending"),
          and(
            eq(schema.inboundEvents.status, "failed_retryable"),
            or(isNull(schema.inboundEvents.nextRetryAtMs), lte(schema.inboundEvents.nextRetryAtMs, now)),
          ),
        ),
      ),
    )
    .orderBy(asc(schema.inboundEvents.id))
    .limit(limit);
  return due;
}

export async function markInboundInFlight(id: number): Promise<void> {
  await db().update(schema.inboundEvents).set({ status: "in_flight" }).where(eq(schema.inboundEvents.id, id));
}

export async function markInboundProcessed(id: number): Promise<void> {
  await db()
    .update(schema.inboundEvents)
    .set({ status: "processed", processedAtMs: Date.now(), lastError: null })
    .where(eq(schema.inboundEvents.id, id));
}

/** Schedule a retry with exponential backoff, or give up (status=failed) once
 *  attempts hit the cap. Mirrors the webhook_deliveries backoff. */
export async function scheduleInboundRetry(input: {
  id: number;
  attempts: number;
  maxAttempts: number;
  baseBackoffSeconds: number;
  error: string;
}): Promise<"retry" | "failed"> {
  const newAttempts = input.attempts + 1;
  if (newAttempts >= input.maxAttempts) {
    await db()
      .update(schema.inboundEvents)
      .set({ status: "failed", attempts: newAttempts, lastError: input.error })
      .where(eq(schema.inboundEvents.id, input.id));
    return "failed";
  }
  const delayMs = input.baseBackoffSeconds * 1000 * Math.pow(2, input.attempts);
  await db()
    .update(schema.inboundEvents)
    .set({
      status: "failed_retryable",
      attempts: newAttempts,
      nextRetryAtMs: Date.now() + delayMs,
      lastError: input.error,
    })
    .where(eq(schema.inboundEvents.id, input.id));
  return "retry";
}

// === Canonical outcome events ===

/** Upsert a canonical event. Idempotent on (connectorId, sourceEventId): a
 *  re-delivery updates in place rather than double-counting. Returns the row +
 *  whether it was newly created. */
export async function upsertOutcomeEvent(input: {
  customerId: string;
  connectorId: string;
  sourceSystem: string;
  sourceEventId: string;
  eventType: string;
  entityId: string;
  occurredAt: number;
  rawPayload: unknown;
  normalizedFields: Record<string, unknown>;
  confidence: number;
  reversalWindowExpiresAt: number | null;
  billingStatus: "provisional" | "finalized" | "reversed";
}): Promise<{ row: OutcomeEventRow; created: boolean }> {
  const now = Date.now();
  const rows = await db()
    .insert(schema.outcomeEvents)
    .values({
      id: `oe_${randomUUID()}`,
      customerId: input.customerId,
      connectorId: input.connectorId,
      sourceSystem: input.sourceSystem,
      sourceEventId: input.sourceEventId,
      eventType: input.eventType,
      entityId: input.entityId,
      occurredAt: input.occurredAt,
      rawPayload: input.rawPayload as object,
      normalizedFields: input.normalizedFields,
      confidence: input.confidence,
      reversalWindowExpiresAt: input.reversalWindowExpiresAt,
      billingStatus: input.billingStatus,
      finalizedAtMs: input.billingStatus === "finalized" ? now : null,
      createdAtMs: now,
      updatedAtMs: now,
    })
    .onConflictDoUpdate({
      target: [schema.outcomeEvents.connectorId, schema.outcomeEvents.sourceEventId],
      set: { updatedAtMs: now },
    })
    .returning();
  const row = rows[0];
  return { row, created: row.createdAtMs === now && row.updatedAtMs === now };
}

/** Provisional events whose reversal window has elapsed — the reversal job's
 *  work list. */
export async function listDueForFinalization(nowMs: number, limit = 200): Promise<OutcomeEventRow[]> {
  return db()
    .select()
    .from(schema.outcomeEvents)
    .where(
      and(
        eq(schema.outcomeEvents.billingStatus, "provisional"),
        lte(schema.outcomeEvents.reversalWindowExpiresAt, nowMs),
      ),
    )
    .orderBy(asc(schema.outcomeEvents.reversalWindowExpiresAt))
    .limit(limit);
}

/** All events for one entity, ACROSS source systems, for a customer — used by
 *  the reversal classifier. Cross-system by design: a Greenhouse/Lever hire and
 *  a BambooHR termination share (customerId, entityId=email); a ServiceTitan job
 *  and its invoice share (customerId, entityId=jobId). */
export async function listEventsForEntity(customerId: string, entityId: string): Promise<OutcomeEventRow[]> {
  return db()
    .select()
    .from(schema.outcomeEvents)
    .where(and(eq(schema.outcomeEvents.customerId, customerId), eq(schema.outcomeEvents.entityId, entityId)))
    .orderBy(asc(schema.outcomeEvents.occurredAt));
}

export async function finalizeOutcomeEvent(id: string): Promise<void> {
  const now = Date.now();
  await db()
    .update(schema.outcomeEvents)
    .set({ billingStatus: "finalized", finalizedAtMs: now, updatedAtMs: now })
    .where(eq(schema.outcomeEvents.id, id));
}

export async function reverseOutcomeEvent(id: string, reversedByEventId: string): Promise<void> {
  const now = Date.now();
  await db()
    .update(schema.outcomeEvents)
    .set({ billingStatus: "reversed", reversedByEventId, updatedAtMs: now })
    .where(eq(schema.outcomeEvents.id, id));
}

/** Immediately reverse any still-provisional outcome for an entity when a
 *  reversing event (termination/refund/dispute) arrives inside the window.
 *  Cross-system: matches on (customerId, entityId). */
export async function reverseProvisionalForEntity(input: {
  customerId: string;
  entityId: string;
  reversedByEventId: string;
}): Promise<number> {
  const now = Date.now();
  const res = await db()
    .update(schema.outcomeEvents)
    .set({ billingStatus: "reversed", reversedByEventId: input.reversedByEventId, updatedAtMs: now })
    .where(
      and(
        eq(schema.outcomeEvents.customerId, input.customerId),
        eq(schema.outcomeEvents.entityId, input.entityId),
        eq(schema.outcomeEvents.billingStatus, "provisional"),
      ),
    );
  return res.rowCount ?? 0;
}

export async function listOutcomeEvents(customerId?: string, limit = 100): Promise<OutcomeEventRow[]> {
  const base = db().select().from(schema.outcomeEvents);
  const rows = customerId
    ? await base.where(eq(schema.outcomeEvents.customerId, customerId)).orderBy(sql`occurred_at DESC`).limit(limit)
    : await base.orderBy(sql`occurred_at DESC`).limit(limit);
  return rows;
}
