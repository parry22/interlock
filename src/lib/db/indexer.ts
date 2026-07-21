// Event indexer — mirrors on-chain Sui state into Postgres for fast reads.
//
// Strategy:
//   • For each indexed table (workflows / quotes / settlements / disputes),
//     call the existing query helper that already wraps Sui RPC + Walrus.
//   • Upsert into the corresponding indexed_* table.
//   • Track the latest run in `indexer_cursor` per event type so we can
//     surface health + last-update time in the UI.
//
// Note: this isn't a "real" incremental indexer — it re-scans the recent
// window every tick. For hackathon scale (<100 workflows) the cost is tiny
// (~5 RPC calls). At production scale you'd subscribe to Sui events directly
// and only process the delta.

import { sql } from "drizzle-orm";

import {
  db,
  indexerCursor,
  indexedWorkflows,
  indexedQuotes,
  indexedSettlements,
  indexedDisputes,
  webhookDeliveries,
  tenantSettings,
  type NewCustomer,
} from "./index";
import {
  listWorkflows,
  listQuotes,
  listSettlements,
  listDisputes,
} from "@/lib/interlock/queries";

const STATUS_NAMES = [
  "Quoted",
  "Executing",
  "Verified",
  "Settled",
  "Disputed",
  "Refunded",
];

export type IndexerResult = {
  eventType: string;
  upserts: number;
  durationMs: number;
  error?: string;
};

async function recordCursor(
  eventType: string,
  ok: boolean,
  error: string | undefined,
): Promise<void> {
  const d = db();
  await d
    .insert(indexerCursor)
    .values({
      eventType,
      lastIndexedAtMs: Date.now(),
      isHealthy: ok,
      lastError: error ?? null,
    })
    .onConflictDoUpdate({
      target: indexerCursor.eventType,
      set: {
        lastIndexedAtMs: Date.now(),
        isHealthy: ok,
        lastError: error ?? null,
        updatedAt: new Date(),
      },
    });
}

async function indexWorkflows(): Promise<IndexerResult> {
  const t0 = Date.now();
  try {
    const items = await listWorkflows({ limit: 100 });
    if (items.length === 0) {
      await recordCursor("workflow", true, undefined);
      return { eventType: "workflow", upserts: 0, durationMs: Date.now() - t0 };
    }
    const d = db();
    for (const w of items) {
      await d
        .insert(indexedWorkflows)
        .values({
          id: w.id,
          customer: w.customer,
          productId: w.productId,
          status: w.statusEnum,
          statusName: STATUS_NAMES[w.statusEnum] ?? "Unknown",
          quoteId: w.quoteId,
          executionId: w.executionId,
          outcomeId: w.outcomeId,
          settlementId: w.settlementId,
          totalRevenue: w.totalRevenue,
          totalCost: w.totalCost,
          margin: w.margin,
          escrowBalance: w.escrowBalance,
          createdAtMs: w.createdAtMs,
          updatedAtMs: w.updatedAtMs,
          indexedAtMs: Date.now(),
        })
        .onConflictDoUpdate({
          target: indexedWorkflows.id,
          set: {
            status: w.statusEnum,
            statusName: STATUS_NAMES[w.statusEnum] ?? "Unknown",
            quoteId: w.quoteId,
            executionId: w.executionId,
            outcomeId: w.outcomeId,
            settlementId: w.settlementId,
            totalRevenue: w.totalRevenue,
            totalCost: w.totalCost,
            margin: w.margin,
            escrowBalance: w.escrowBalance,
            updatedAtMs: w.updatedAtMs,
            indexedAtMs: Date.now(),
          },
        });
    }
    await recordCursor("workflow", true, undefined);
    return { eventType: "workflow", upserts: items.length, durationMs: Date.now() - t0 };
  } catch (e) {
    await recordCursor("workflow", false, (e as Error).message);
    return {
      eventType: "workflow",
      upserts: 0,
      durationMs: Date.now() - t0,
      error: (e as Error).message,
    };
  }
}

async function indexQuotes(): Promise<IndexerResult> {
  const t0 = Date.now();
  try {
    const items = await listQuotes({ limit: 100 });
    if (items.length === 0) {
      await recordCursor("quote", true, undefined);
      return { eventType: "quote", upserts: 0, durationMs: Date.now() - t0 };
    }
    const d = db();
    for (const q of items) {
      let criteriaJson: unknown = null;
      try {
        // success_criteria is JSON in our SDK encoding; ignore parse failures.
        // (queries.ts already returns it as text.)
      } catch {
        // noop
      }
      await d
        .insert(indexedQuotes)
        .values({
          id: q.id,
          productId: q.productId,
          customer: q.customer,
          price: q.price,
          pricingModel: q.pricingModel,
          successCriteria: criteriaJson,
          successCriteriaHashHex: q.successCriteriaHashHex,
          expiresAtMs: q.expiresAtMs,
          createdAtMs: q.createdAtMs,
          usedByWorkflowId: null,
        })
        .onConflictDoNothing();
    }
    await recordCursor("quote", true, undefined);
    return { eventType: "quote", upserts: items.length, durationMs: Date.now() - t0 };
  } catch (e) {
    await recordCursor("quote", false, (e as Error).message);
    return {
      eventType: "quote",
      upserts: 0,
      durationMs: Date.now() - t0,
      error: (e as Error).message,
    };
  }
}

async function indexSettlements(): Promise<IndexerResult> {
  const t0 = Date.now();
  try {
    const items = await listSettlements({ limit: 100 });
    if (items.length === 0) {
      await recordCursor("settlement", true, undefined);
      return { eventType: "settlement", upserts: 0, durationMs: Date.now() - t0 };
    }
    const d = db();
    let newSettlements = 0;
    for (const s of items) {
      const inserted = await d
        .insert(indexedSettlements)
        .values({
          id: s.id,
          workflowId: s.workflowId,
          totalSettled: s.totalSettled,
          platformFee: s.platformFee,
          settledAtMs: s.settledAtMs,
          splits: s.splits,
        })
        .onConflictDoNothing()
        .returning({ id: indexedSettlements.id });
      if (inserted.length > 0) {
        newSettlements += 1;
        await enqueueWebhooksForSettlement(s);
      }
    }
    await recordCursor("settlement", true, undefined);
    return {
      eventType: "settlement",
      upserts: newSettlements,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    await recordCursor("settlement", false, (e as Error).message);
    return {
      eventType: "settlement",
      upserts: 0,
      durationMs: Date.now() - t0,
      error: (e as Error).message,
    };
  }
}

async function indexDisputes(): Promise<IndexerResult> {
  const t0 = Date.now();
  try {
    const items = await listDisputes({ limit: 100 });
    if (items.length === 0) {
      await recordCursor("dispute", true, undefined);
      return { eventType: "dispute", upserts: 0, durationMs: Date.now() - t0 };
    }
    const d = db();
    for (const ds of items) {
      // Skip duplicates: dispute identity = workflow_id + timestamp_ms.
      const existing = await d.execute(sql`
        SELECT id FROM ${indexedDisputes}
        WHERE workflow_id = ${ds.workflowId} AND timestamp_ms = ${ds.timestampMs}
        LIMIT 1
      `);
      // drizzle-orm's execute returns { rows: ... } for raw SQL.
      const rows = (existing as unknown as { rows: unknown[] }).rows ?? [];
      if (rows.length > 0) continue;
      await d.insert(indexedDisputes).values({
        workflowId: ds.workflowId,
        outcomeId: ds.outcomeId,
        evidenceBlobIdHex: ds.evidenceBlobIdHex,
        filedBy: ds.filedBy,
        timestampMs: ds.timestampMs,
      });
    }
    await recordCursor("dispute", true, undefined);
    return { eventType: "dispute", upserts: items.length, durationMs: Date.now() - t0 };
  } catch (e) {
    await recordCursor("dispute", false, (e as Error).message);
    return {
      eventType: "dispute",
      upserts: 0,
      durationMs: Date.now() - t0,
      error: (e as Error).message,
    };
  }
}

/**
 * Enqueue a WorkflowSettled webhook for every tenant who's configured one
 * with that topic enabled (or no topic filter at all).
 */
async function enqueueWebhooksForSettlement(s: {
  id: string;
  workflowId: string;
  totalSettled: number;
  platformFee: number;
  settledAtMs: number;
  splits: Array<{ recipient: string; amount: number; role: number }>;
}): Promise<void> {
  const d = db();
  const tenants = await d.select().from(tenantSettings);
  for (const t of tenants) {
    if (!t.webhookUrl) continue;
    const topicFilter = t.topics ?? [];
    if (topicFilter.length > 0 && !topicFilter.includes("WorkflowSettled")) continue;
    await d.insert(webhookDeliveries).values({
      tenantAddress: t.tenantAddress,
      eventType: "WorkflowSettled",
      payload: {
        settlementId: s.id,
        workflowId: s.workflowId,
        totalSettled: s.totalSettled,
        platformFee: s.platformFee,
        settledAtMs: s.settledAtMs,
        splits: s.splits,
      },
      status: "pending",
      createdAtMs: Date.now(),
    });
  }
}

/** Run a full indexer tick across all four event types. */
export async function runIndexerTick(): Promise<{
  results: IndexerResult[];
  totalDurationMs: number;
}> {
  const t0 = Date.now();
  // Run sequentially to avoid Sui RPC rate limits + Postgres lock contention.
  const results: IndexerResult[] = [];
  results.push(await indexWorkflows());
  results.push(await indexQuotes());
  results.push(await indexSettlements());
  results.push(await indexDisputes());
  return { results, totalDurationMs: Date.now() - t0 };
}

// Re-export NewCustomer to satisfy TS (used elsewhere).
export type { NewCustomer };
