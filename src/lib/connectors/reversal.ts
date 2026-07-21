// Generic reversal / gaming-protection engine.
//
// This is deliberately vertical-agnostic: it operates on ANY canonical event
// with a reversalWindowExpiresAt, driven by three small event-type sets — NOT
// by per-connector code. Recruiting (hire vs termination) and field service
// (job completed vs refund/dispute, confirmed by invoice.paid) both fall out of
// the same rules, and a future vertical only has to emit canonical types.
//
// Rules:
//   • BILLABLE types can be provisional and become billable when finalized.
//   • REVERSING types void a still-provisional billable event for the same
//     entity if they occur within its window (termination, refund, dispute).
//   • CONFIRMING types let a provisional billable event finalize EARLY (e.g.
//     invoice.paid confirms a completed job before the grace period elapses).

import {
  finalizeOutcomeEvent,
  listDueForFinalization,
  listEventsForEntity,
  reverseOutcomeEvent,
  reverseProvisionalForEntity,
  type OutcomeEventRow,
} from "@/lib/db/connectors";
import { emitOutcome } from "./emit";

/** Billable candidates — these carry the provisional→finalized lifecycle. */
export const BILLABLE_TYPES = new Set<string>(["job.completed", "hire.started"]);

/** Events that reverse a provisional billable event for the same entity. */
export const REVERSING_TYPES = new Set<string>([
  "employment.terminated",
  "invoice.refunded",
  "job.disputed",
]);

/** confirming event type → billable types it finalizes early. */
export const CONFIRMS: Record<string, string[]> = {
  "invoice.paid": ["job.completed"],
};

export function isReversingType(t: string): boolean {
  return REVERSING_TYPES.has(t);
}
export function isBillableType(t: string): boolean {
  return BILLABLE_TYPES.has(t);
}

/** Pure reversal decision: among `siblings` (all events for the same
 *  customer+entity), find one that reverses `event` — a reversing type that
 *  occurred within [event.occurredAt, event.reversalWindowExpiresAt]. Returns
 *  the reverser or null. Shared by the cron and the out-of-order guard so both
 *  agree, and unit-testable without a database. */
export function selectReverser<
  T extends { eventType: string; occurredAt: number; reversalWindowExpiresAt: number | null },
>(event: T, siblings: T[]): T | null {
  const windowEnd = event.reversalWindowExpiresAt ?? Number.MAX_SAFE_INTEGER;
  return (
    siblings.find(
      (s) => REVERSING_TYPES.has(s.eventType) && s.occurredAt >= event.occurredAt && s.occurredAt <= windowEnd,
    ) ?? null
  );
}

/** Called from ingest when a REVERSING event lands: void any still-provisional
 *  billable event for the same entity (inside or outside its window — a
 *  termination the day after a 90-day finalize can't retroactively reverse,
 *  because that event is already `finalized`, not `provisional`). */
export async function applyReversingEvent(row: OutcomeEventRow): Promise<number> {
  return reverseProvisionalForEntity({
    customerId: row.customerId,
    entityId: row.entityId,
    reversedByEventId: row.id,
  });
}

/** Called from ingest when a CONFIRMING event lands: early-finalize the matching
 *  provisional billable event(s) for the entity and emit them. Returns count. */
export async function applyConfirmingEvent(row: OutcomeEventRow): Promise<number> {
  const confirms = CONFIRMS[row.eventType];
  if (!confirms) return 0;
  const events = await listEventsForEntity(row.customerId, row.entityId);
  let finalized = 0;
  for (const e of events) {
    if (e.billingStatus === "provisional" && confirms.includes(e.eventType)) {
      await finalizeOutcomeEvent(e.id);
      await emitOutcome({ ...e, billingStatus: "finalized" }, "finalized");
      finalized++;
    }
  }
  return finalized;
}

/** The scheduled reversal job (reversal-tick cron). For every provisional event
 *  whose window has elapsed: reverse it if a reversing event for the same entity
 *  occurred within the window, otherwise finalize + emit. Idempotent. */
export async function finalizeDueEvents(nowMs = Date.now()): Promise<{
  scanned: number;
  finalized: number;
  reversed: number;
}> {
  const due = await listDueForFinalization(nowMs);
  let finalized = 0;
  let reversed = 0;

  for (const e of due) {
    const siblings = await listEventsForEntity(e.customerId, e.entityId);
    const reverser = selectReverser(e, siblings);
    if (reverser) {
      await reverseOutcomeEvent(e.id, reverser.id);
      await emitOutcome({ ...e, billingStatus: "reversed" }, "reversed");
      reversed++;
    } else {
      await finalizeOutcomeEvent(e.id);
      await emitOutcome({ ...e, billingStatus: "finalized" }, "finalized");
      finalized++;
    }
  }
  return { scanned: due.length, finalized, reversed };
}
