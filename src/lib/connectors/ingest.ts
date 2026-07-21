// Shared ingest core — the single path every inbound event flows through,
// whether it arrived by webhook or by the polling fallback:
//
//   land (dedupe on sourceEventId) → normalize → upsert canonical event(s)
//   → apply reversal/confirmation rules → emit finalized outcomes
//
// Processing failures are never dropped: the inbound row is retried with
// exponential backoff by the ingest-tick cron, capped, then marked failed.

import {
  getConnection,
  getInboundEvent,
  landInboundEvent,
  markInboundInFlight,
  markInboundProcessed,
  scheduleInboundRetry,
  toConnection,
  upsertOutcomeEvent,
  listEventsForEntity,
  reverseOutcomeEvent,
  type InboundEventRow,
  type OutcomeEventRow,
} from "@/lib/db/connectors";
import { emitOutcome } from "./emit";
import {
  applyConfirmingEvent,
  applyReversingEvent,
  CONFIRMS,
  isBillableType,
  isReversingType,
  selectReverser,
} from "./reversal";
import { getConnector } from "./registry";
import type { Connection, Connector } from "./types";

const RETRY_MAX_ATTEMPTS = 5;
const RETRY_BASE_BACKOFF_SECONDS = 30;

/** Land a raw delivery (idempotent) and process it inline. Called by the
 *  webhook route + the polling cron. Duplicate deliveries are a no-op. */
export async function ingestRaw(input: {
  connection: Connection;
  connector: Connector;
  sourceEventId: string;
  rawPayload: unknown;
}): Promise<{ deduped: boolean; inboundId: number | null; created: number }> {
  const landed = await landInboundEvent({
    connectionId: input.connection.id,
    sourceSystem: input.connection.sourceSystem,
    sourceEventId: input.sourceEventId,
    rawPayload: input.rawPayload,
  });
  if (landed.deduped || landed.id == null) return { deduped: true, inboundId: null, created: 0 };

  const res = await processInboundEvent(landed.id);
  return { deduped: false, inboundId: landed.id, created: res.created };
}

/** Process one landed inbound row through normalize → store → reversal rules,
 *  with retry-on-failure bookkeeping. Safe to call from the cron drainer. */
export async function processInboundEvent(inboundId: number): Promise<{ created: number; status: string }> {
  const row = await getInboundEvent(inboundId);
  if (!row || row.status === "processed" || row.status === "duplicate") {
    return { created: 0, status: row?.status ?? "missing" };
  }
  await markInboundInFlight(row.id);

  try {
    const created = await normalizeAndStore(row);
    await markInboundProcessed(row.id);
    return { created, status: "processed" };
  } catch (e) {
    const outcome = await scheduleInboundRetry({
      id: row.id,
      attempts: row.attempts,
      maxAttempts: RETRY_MAX_ATTEMPTS,
      baseBackoffSeconds: RETRY_BASE_BACKOFF_SECONDS,
      error: (e as Error).message,
    });
    return { created: 0, status: outcome };
  }
}

/** Pure-ish core: normalize a landed payload and apply storage + reversal rules.
 *  Throws on any failure so the caller can retry. */
async function normalizeAndStore(row: InboundEventRow): Promise<number> {
  const connRow = await getConnection(row.connectionId);
  if (!connRow) throw new Error(`connection ${row.connectionId} not found`);
  const conn = toConnection(connRow);
  const connector = getConnector(conn.sourceSystem);
  if (!connector) throw new Error(`no connector registered for ${conn.sourceSystem}`);

  const canonical = connector.normalize(row.rawPayload, conn);
  let created = 0;

  for (const ev of canonical) {
    const billable = isBillableType(ev.eventType);
    const hasWindow = ev.reversalWindowExpiresAt != null;
    // Billable + windowed → provisional (held for the reversal window).
    // Everything else (facts: stage changes, terminations, payments) → finalized.
    const provisional = billable && hasWindow;

    const { row: stored, created: isNew } = await upsertOutcomeEvent({
      customerId: conn.customerId,
      connectorId: conn.id,
      sourceSystem: ev.sourceSystem,
      sourceEventId: ev.sourceEventId,
      eventType: ev.eventType,
      entityId: ev.entityId,
      occurredAt: ev.occurredAt,
      rawPayload: row.rawPayload,
      normalizedFields: ev.normalizedFields,
      confidence: ev.confidence ?? 1,
      reversalWindowExpiresAt: ev.reversalWindowExpiresAt ?? null,
      billingStatus: provisional ? "provisional" : "finalized",
    });
    if (isNew) created++;
    if (!isNew) continue; // re-delivery: don't re-run side effects

    await applyPostStoreRules(stored);
  }
  return created;
}

/** Apply the generic reversal/confirmation rules for a freshly-stored event. */
async function applyPostStoreRules(stored: OutcomeEventRow): Promise<void> {
  // A reversing event (termination/refund/dispute) voids provisional billables.
  if (isReversingType(stored.eventType)) {
    await applyReversingEvent(stored);
    return;
  }
  // A confirming event (invoice.paid) early-finalizes a provisional job.
  if (CONFIRMS[stored.eventType]) {
    await applyConfirmingEvent(stored);
    return;
  }
  // A billable event.
  if (isBillableType(stored.eventType)) {
    if (stored.billingStatus === "finalized") {
      // No reversal window → billable immediately.
      await emitOutcome(stored, "finalized");
      return;
    }
    // Provisional: guard against OUT-OF-ORDER delivery where the reversing
    // event already arrived before this billable one.
    const siblings = await listEventsForEntity(stored.customerId, stored.entityId);
    const priorReverser = selectReverser(stored, siblings);
    if (priorReverser) {
      await reverseOutcomeEvent(stored.id, priorReverser.id);
      await emitOutcome({ ...stored, billingStatus: "reversed" }, "reversed");
    }
    // else: leave provisional; reversal-tick finalizes it when the window ends.
  }
}
