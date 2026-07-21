// Postgres-backed read queries.
//
// Mirrors the surface of `src/lib/interlock/queries.ts` but reads from the
// indexed_* tables. Sub-100ms dashboard queries, immune to Sui RPC outages.
//
// Freshness: depends on the last indexer tick (see /api/keeper/index-tick).
// The indexer cron refreshes every hour; we also trigger it manually from
// the "Refresh indexer" button on /settings and (in the future) after each
// /api/demo/run-lifecycle completes.
//
// Per-tenant scoping: every read accepts an optional `customer` filter (a
// Sui address). When set, the query restricts itself to that customer's data.
// When omitted, behavior is the legacy unscoped read — kept available for
// keeper/indexer/system jobs that legitimately need cross-tenant visibility.
// API routes always pass the current user's address; never call these
// functions unscoped from a request handler.

import { sql, desc, eq, and, inArray } from "drizzle-orm";

import {
  db,
  indexedWorkflows,
  indexedQuotes,
  indexedSettlements,
  indexedDisputes,
} from "./index";

type ScopedOpts = { limit?: number; customer?: string };

// === Workflow ===

export type WorkflowSummary = {
  id: string;
  customer: string;
  productId: string;
  status: string;
  statusEnum: number;
  quoteId: string | null;
  executionId: string | null;
  outcomeId: string | null;
  settlementId: string | null;
  totalRevenue: number;
  totalCost: number;
  margin: number;
  escrowBalance: number;
  createdAtMs: number;
  updatedAtMs: number;
};

export async function listWorkflows(opts?: ScopedOpts): Promise<WorkflowSummary[]> {
  const q = db()
    .select()
    .from(indexedWorkflows)
    .orderBy(desc(indexedWorkflows.createdAtMs))
    .limit(opts?.limit ?? 50);
  const rows = opts?.customer
    ? await q.where(eq(indexedWorkflows.customer, opts.customer.toLowerCase()))
    : await q;
  return rows.map((r) => ({
    id: r.id,
    customer: r.customer,
    productId: r.productId,
    status: r.statusName,
    statusEnum: r.status,
    quoteId: r.quoteId,
    executionId: r.executionId,
    outcomeId: r.outcomeId,
    settlementId: r.settlementId,
    totalRevenue: r.totalRevenue,
    totalCost: r.totalCost,
    margin: r.margin,
    escrowBalance: r.escrowBalance,
    createdAtMs: r.createdAtMs,
    updatedAtMs: r.updatedAtMs,
  }));
}

// === Quote ===

export type QuoteListItem = {
  id: string;
  productId: string;
  customer: string;
  price: number;
  pricingModel: number;
  successCriteriaHashHex: string;
  expiresAtMs: number;
  createdAtMs: number;
  used: boolean;
  status: "Active" | "Used" | "Expired";
};

export async function listQuotes(opts?: ScopedOpts): Promise<QuoteListItem[]> {
  const baseQ = db()
    .select()
    .from(indexedQuotes)
    .orderBy(desc(indexedQuotes.createdAtMs))
    .limit(opts?.limit ?? 50);
  const quotes = opts?.customer
    ? await baseQ.where(eq(indexedQuotes.customer, opts.customer.toLowerCase()))
    : await baseQ;

  // Compute "used" via a join against indexed_workflows. When scoped, restrict
  // the workflow scan to the same customer so a foreign workflow that happens
  // to reference our quote can't flip its status.
  const wfQ = db().select({ quoteId: indexedWorkflows.quoteId }).from(indexedWorkflows);
  const workflowQuoteIds = opts?.customer
    ? await wfQ.where(eq(indexedWorkflows.customer, opts.customer.toLowerCase()))
    : await wfQ;
  const usedSet = new Set(
    workflowQuoteIds.map((w) => w.quoteId).filter((x): x is string => x != null),
  );

  const now = Date.now();
  return quotes.map((q) => {
    const used = usedSet.has(q.id);
    const status: QuoteListItem["status"] = used
      ? "Used"
      : q.expiresAtMs < now
        ? "Expired"
        : "Active";
    return {
      id: q.id,
      productId: q.productId,
      customer: q.customer,
      price: q.price,
      pricingModel: q.pricingModel,
      successCriteriaHashHex: q.successCriteriaHashHex,
      expiresAtMs: q.expiresAtMs,
      createdAtMs: q.createdAtMs,
      used,
      status,
    };
  });
}

// === Settlement ===

export type SettlementSummary = {
  id: string;
  workflowId: string;
  totalSettled: number;
  platformFee: number;
  settledAtMs: number;
  splits: Array<{ recipient: string; amount: number; role: number }>;
};

export async function listSettlements(opts?: ScopedOpts): Promise<SettlementSummary[]> {
  // Settlements don't carry a customer column directly — they're joined via
  // workflowId. When scoped we restrict to settlements whose workflow is owned
  // by the requested customer.
  if (opts?.customer) {
    const customer = opts.customer.toLowerCase();
    const myWorkflowIds = (
      await db()
        .select({ id: indexedWorkflows.id })
        .from(indexedWorkflows)
        .where(eq(indexedWorkflows.customer, customer))
    ).map((r) => r.id);
    if (myWorkflowIds.length === 0) return [];
    const rows = await db()
      .select()
      .from(indexedSettlements)
      .where(inArray(indexedSettlements.workflowId, myWorkflowIds))
      .orderBy(desc(indexedSettlements.settledAtMs))
      .limit(opts?.limit ?? 50);
    return rows.map((r) => ({
      id: r.id,
      workflowId: r.workflowId,
      totalSettled: r.totalSettled,
      platformFee: r.platformFee,
      settledAtMs: r.settledAtMs,
      splits: r.splits,
    }));
  }
  const rows = await db()
    .select()
    .from(indexedSettlements)
    .orderBy(desc(indexedSettlements.settledAtMs))
    .limit(opts?.limit ?? 50);
  return rows.map((r) => ({
    id: r.id,
    workflowId: r.workflowId,
    totalSettled: r.totalSettled,
    platformFee: r.platformFee,
    settledAtMs: r.settledAtMs,
    splits: r.splits,
  }));
}

// === Dispute stats ===

export type DisputeEventRow = {
  workflowId: string;
  outcomeId: string;
  evidenceBlobIdHex: string;
  filedBy: string;
  timestampMs: number;
};

export async function listDisputes(opts?: ScopedOpts): Promise<DisputeEventRow[]> {
  // Disputes are filed by an address (filed_by). When scoped, return disputes
  // either filed by the customer OR attached to workflows owned by the customer.
  if (opts?.customer) {
    const customer = opts.customer.toLowerCase();
    const myWorkflowIds = (
      await db()
        .select({ id: indexedWorkflows.id })
        .from(indexedWorkflows)
        .where(eq(indexedWorkflows.customer, customer))
    ).map((r) => r.id);
    if (myWorkflowIds.length === 0) return [];
    const rows = await db()
      .select()
      .from(indexedDisputes)
      .where(inArray(indexedDisputes.workflowId, myWorkflowIds))
      .orderBy(desc(indexedDisputes.timestampMs))
      .limit(opts?.limit ?? 100);
    return rows.map((r) => ({
      workflowId: r.workflowId,
      outcomeId: r.outcomeId,
      evidenceBlobIdHex: r.evidenceBlobIdHex,
      filedBy: r.filedBy,
      timestampMs: r.timestampMs,
    }));
  }
  const rows = await db()
    .select()
    .from(indexedDisputes)
    .orderBy(desc(indexedDisputes.timestampMs))
    .limit(opts?.limit ?? 100);
  return rows.map((r) => ({
    workflowId: r.workflowId,
    outcomeId: r.outcomeId,
    evidenceBlobIdHex: r.evidenceBlobIdHex,
    filedBy: r.filedBy,
    timestampMs: r.timestampMs,
  }));
}

export type DisputeStats = {
  totalDisputes: number;
  totalSettled: number;
  ratePct: number;
  byMonth: Array<{
    month: string;
    disputes: number;
    settlements: number;
    ratePct: number;
  }>;
};

export async function disputeStats(opts?: { customer?: string }): Promise<DisputeStats> {
  const [disputes, settlements] = await Promise.all([
    listDisputes({ limit: 200, customer: opts?.customer }),
    listSettlements({ limit: 200, customer: opts?.customer }),
  ]);
  const total = disputes.length;
  const settledTotal = settlements.length;
  const rate = settledTotal === 0 ? 0 : (total / settledTotal) * 100;

  const now = new Date();
  const months: Array<{
    key: string;
    label: string;
    disputes: number;
    settlements: number;
  }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString(undefined, { month: "short" }),
      disputes: 0,
      settlements: 0,
    });
  }
  const bucketKey = (ms: number): string => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  for (const d of disputes) {
    const b = months.find((m) => m.key === bucketKey(d.timestampMs));
    if (b) b.disputes += 1;
  }
  for (const s of settlements) {
    const b = months.find((m) => m.key === bucketKey(s.settledAtMs));
    if (b) b.settlements += 1;
  }
  return {
    totalDisputes: total,
    totalSettled: settledTotal,
    ratePct: rate,
    byMonth: months.map((m) => ({
      month: m.label,
      disputes: m.disputes,
      settlements: m.settlements,
      ratePct: m.settlements === 0 ? 0 : (m.disputes / m.settlements) * 100,
    })),
  };
}

// === Customer aggregates ===

export type CustomerAggregate = {
  customer: string;
  workflowCount: number;
  totalSettled: number;
  totalEscrowed: number;
  margin: number;
  refundedCount: number;
};

export async function customerAggregates(opts?: ScopedOpts): Promise<CustomerAggregate[]> {
  // Scoped: one row for the requested customer (or empty if they have no
  // workflows yet). Unscoped: every customer, descending by GMV.
  const baseSelect = db()
    .select({
      customer: indexedWorkflows.customer,
      workflowCount: sql<number>`COUNT(*)::int`,
      totalSettled: sql<number>`COALESCE(SUM(${indexedWorkflows.totalRevenue}), 0)::bigint`,
      totalEscrowed: sql<number>`COALESCE(SUM(${indexedWorkflows.escrowBalance}), 0)::bigint`,
      margin: sql<number>`COALESCE(SUM(${indexedWorkflows.margin}), 0)::bigint`,
      refundedCount: sql<number>`COUNT(CASE WHEN ${indexedWorkflows.status} = 5 THEN 1 END)::int`,
    })
    .from(indexedWorkflows)
    .groupBy(indexedWorkflows.customer)
    .orderBy(desc(sql`SUM(${indexedWorkflows.totalRevenue})`))
    .limit(opts?.limit ?? 100);
  const rows = opts?.customer
    ? await baseSelect.where(eq(indexedWorkflows.customer, opts.customer.toLowerCase()))
    : await baseSelect;
  return rows.map((r) => ({
    customer: r.customer,
    workflowCount: Number(r.workflowCount),
    totalSettled: Number(r.totalSettled),
    totalEscrowed: Number(r.totalEscrowed),
    margin: Number(r.margin),
    refundedCount: Number(r.refundedCount),
  }));
}

// === Dashboard stats ===

export type DashboardStats = {
  totalWorkflows: number;
  settledCount: number;
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  totalPlatformFee: number;
  inFlight: number;
  refunded: number;
};

export async function dashboardStats(opts?: { customer?: string }): Promise<DashboardStats> {
  const d = db();
  const customer = opts?.customer?.toLowerCase();
  const wfRows = customer
    ? await d.select().from(indexedWorkflows).where(eq(indexedWorkflows.customer, customer))
    : await d.select().from(indexedWorkflows);

  // For platform-fee math we need settlements scoped the same way. If we
  // scoped wf rows, restrict settlements to those workflow IDs.
  let settled: Array<{ platformFee: number }>;
  if (customer) {
    const ids = wfRows.map((w) => w.id);
    settled = ids.length === 0
      ? []
      : await d
          .select({ platformFee: indexedSettlements.platformFee })
          .from(indexedSettlements)
          .where(inArray(indexedSettlements.workflowId, ids));
  } else {
    settled = await d.select({ platformFee: indexedSettlements.platformFee }).from(indexedSettlements);
  }

  let totalRevenue = 0;
  let totalCost = 0;
  let totalMargin = 0;
  let settledCount = 0;
  let inFlight = 0;
  let refunded = 0;
  for (const w of wfRows) {
    totalRevenue += w.totalRevenue;
    totalCost += w.totalCost;
    totalMargin += w.margin;
    if (w.status === 3) settledCount += 1;
    else if (w.status === 5) refunded += 1;
    else inFlight += 1;
  }
  const totalPlatformFee = settled.reduce((s, x) => s + x.platformFee, 0);
  return {
    totalWorkflows: wfRows.length,
    settledCount,
    totalRevenue,
    totalCost,
    totalMargin,
    totalPlatformFee,
    inFlight,
    refunded,
  };
}

// === Margin by product ===

export type MarginByProduct = {
  productId: string;
  workflowCount: number;
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  marginPct: number;
};

export async function marginByProduct(opts?: { customer?: string }): Promise<MarginByProduct[]> {
  const where = opts?.customer
    ? and(eq(indexedWorkflows.status, 3), eq(indexedWorkflows.customer, opts.customer.toLowerCase()))
    : eq(indexedWorkflows.status, 3);
  const rows = await db()
    .select({
      productId: indexedWorkflows.productId,
      workflowCount: sql<number>`COUNT(*)::int`,
      totalRevenue: sql<number>`COALESCE(SUM(${indexedWorkflows.totalRevenue}), 0)::bigint`,
      totalCost: sql<number>`COALESCE(SUM(${indexedWorkflows.totalCost}), 0)::bigint`,
      totalMargin: sql<number>`COALESCE(SUM(${indexedWorkflows.margin}), 0)::bigint`,
    })
    .from(indexedWorkflows)
    .where(where)
    .groupBy(indexedWorkflows.productId);
  return rows.map((r) => {
    const rev = Number(r.totalRevenue);
    const margin = Number(r.totalMargin);
    return {
      productId: r.productId,
      workflowCount: Number(r.workflowCount),
      totalRevenue: rev,
      totalCost: Number(r.totalCost),
      totalMargin: margin,
      marginPct: rev === 0 ? 0 : (margin / rev) * 100,
    };
  });
}
