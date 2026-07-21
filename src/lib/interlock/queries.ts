// Server-side chain reads for the dashboard — Avalanche Fuji edition.
//
// Strategy: WeaveosCore assigns sequential uint256 IDs (nextWorkflowId /
// nextQuoteId), so listing is simple enumeration + view calls — no event-log
// scanning needed (Fuji's public RPC caps eth_getLogs ranges anyway).
// Execution / Outcome / Settlement are 1:1 with a workflow and keyed by the
// same workflowId, so the Sui-era Option<ID> indirection is gone.

import { coreContract, bytesToBlobId } from "./evm";

// === Status names (same enum values as WeaveosTypes.Status) ===

export type StatusName =
  | "Quoted"
  | "Executing"
  | "Verified"
  | "Settled"
  | "Disputed"
  | "Refunded";

const STATUS_NAMES: StatusName[] = [
  "Quoted", "Executing", "Verified", "Settled", "Disputed", "Refunded",
];

export type WorkflowSummary = {
  id: string;
  customer: string;
  productId: string;
  status: StatusName;
  statusEnum: number;
  quoteId: string | null;
  executionId: string | null;
  outcomeId: string | null;
  settlementId: string | null;
  /** USDC base units; only populated once settled. */
  totalRevenue: number;
  totalCost: number;
  margin: number;
  /** Live escrow balance — non-zero only while in flight. */
  escrowBalance: number;
  createdAtMs: number;
  updatedAtMs: number;
};

export type WorkflowDetail = WorkflowSummary & {
  quote: QuoteSummary | null;
  execution: ExecutionSummary | null;
  outcome: OutcomeSummary | null;
  settlement: SettlementSummary | null;
};

export type QuoteSummary = {
  id: string;
  workflowProductId: string;
  customer: string;
  price: number;
  pricingModel: number;
  successCriteria: string; // decoded UTF-8 (encoded as JSON by the SDK)
  successCriteriaHashHex: string;
  expiresAtMs: number;
  createdAtMs: number;
};

export type ExecutionSummary = {
  id: string;
  workflowId: string;
  startedAtMs: number;
  completedAtMs: number;
  traceBlobId: string;
  totalCost: number;
  costItems: Array<{
    provider: string;
    category: number;
    units: number;
    amount: number;
  }>;
};

export type OutcomeSummary = {
  id: string;
  workflowId: string;
  success: boolean;
  artifactBlobId: string;
  proofBlobId: string;
  verifiedAtMs: number;
  disputeWindowEndsMs: number;
};

export type SettlementSummary = {
  id: string;
  workflowId: string;
  totalSettled: number;
  platformFee: number;
  settledAtMs: number;
  splits: Array<{ recipient: string; amount: number; role: number }>;
};

// === Struct decoding helpers ===

/* eslint-disable @typescript-eslint/no-explicit-any */

function toWorkflowSummary(id: number, w: any): WorkflowSummary {
  const statusEnum = Number(w.status);
  const idStr = String(id);
  return {
    id: idStr,
    customer: String(w.customer).toLowerCase(),
    productId: w.productId.toString(),
    status: STATUS_NAMES[statusEnum] ?? "Quoted",
    statusEnum,
    quoteId: w.quoteId > 0n ? w.quoteId.toString() : null,
    // Execution/Outcome/Settlement are keyed by workflowId (1:1).
    executionId: w.hasExecution ? idStr : null,
    outcomeId: w.hasOutcome ? idStr : null,
    settlementId: w.hasSettlement ? idStr : null,
    totalRevenue: Number(w.totalRevenue),
    totalCost: Number(w.totalCost),
    margin: Number(w.margin),
    escrowBalance: Number(w.escrowBalance),
    createdAtMs: Number(w.createdAtMs),
    updatedAtMs: Number(w.updatedAtMs),
  };
}

// === Workflows ===

export async function listWorkflows(opts?: {
  limit?: number;
}): Promise<WorkflowSummary[]> {
  const core = coreContract();
  const next = Number(await core.nextWorkflowId());
  const limit = opts?.limit ?? 50;
  const ids: number[] = [];
  for (let id = next - 1; id >= 1 && ids.length < limit; id--) ids.push(id);

  const rows = await Promise.all(
    ids.map(async (id) => {
      const w = await core.getWorkflow(id);
      return toWorkflowSummary(id, w);
    }),
  );
  return rows;
}

export async function getWorkflow(id: string): Promise<WorkflowDetail | null> {
  const core = coreContract();
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId < 1) return null;

  let w: any;
  try {
    w = await core.getWorkflow(numId);
  } catch {
    return null; // UnknownWorkflow revert
  }
  const summary = toWorkflowSummary(numId, w);

  const [quote, execution, outcome, settlement] = await Promise.all([
    summary.quoteId ? fetchQuote(summary.quoteId) : Promise.resolve(null),
    summary.executionId ? fetchExecution(summary.id) : Promise.resolve(null),
    summary.outcomeId ? fetchOutcome(summary.id) : Promise.resolve(null),
    summary.settlementId ? fetchSettlement(summary.id) : Promise.resolve(null),
  ]);

  return { ...summary, quote, execution, outcome, settlement };
}

export async function fetchQuote(quoteId: string): Promise<QuoteSummary | null> {
  const core = coreContract();
  try {
    const q: any = await core.getQuote(quoteId);
    return {
      id: quoteId,
      workflowProductId: q.productId.toString(),
      customer: String(q.customer).toLowerCase(),
      price: Number(q.price),
      pricingModel: Number(q.pricingModel),
      successCriteria: bytesToBlobId(q.successCriteria),
      successCriteriaHashHex: String(q.successCriteriaHash),
      expiresAtMs: Number(q.expiresAtMs),
      createdAtMs: Number(q.createdAtMs),
    };
  } catch {
    return null;
  }
}

async function fetchExecution(workflowId: string): Promise<ExecutionSummary | null> {
  const core = coreContract();
  try {
    const e: any = await core.getExecution(workflowId);
    return {
      id: workflowId,
      workflowId,
      startedAtMs: Number(e.startedAtMs),
      completedAtMs: Number(e.completedAtMs),
      traceBlobId: bytesToBlobId(e.traceBlobId),
      totalCost: Number(e.totalCost),
      costItems: e.costItems.map((c: any) => ({
        provider: String(c.provider),
        category: Number(c.category),
        units: Number(c.units),
        amount: Number(c.amount),
      })),
    };
  } catch {
    return null;
  }
}

async function fetchOutcome(workflowId: string): Promise<OutcomeSummary | null> {
  const core = coreContract();
  try {
    const o: any = await core.getOutcome(workflowId);
    return {
      id: workflowId,
      workflowId,
      success: Boolean(o.success),
      artifactBlobId: bytesToBlobId(o.artifactBlobId),
      proofBlobId: bytesToBlobId(o.proofBlobId),
      verifiedAtMs: Number(o.verifiedAtMs),
      disputeWindowEndsMs: Number(o.disputeWindowEndsMs),
    };
  } catch {
    return null;
  }
}

async function fetchSettlement(workflowId: string): Promise<SettlementSummary | null> {
  const core = coreContract();
  try {
    const s: any = await core.getSettlement(workflowId);
    return {
      id: workflowId,
      workflowId,
      totalSettled: Number(s.totalSettled),
      platformFee: Number(s.platformFee),
      settledAtMs: Number(s.settledAtMs),
      splits: s.splits.map((sp: any) => ({
        recipient: String(sp.recipient),
        amount: Number(sp.amount),
        role: Number(sp.role),
      })),
    };
  } catch {
    return null;
  }
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

export async function dashboardStats(): Promise<DashboardStats> {
  const wfs = await listWorkflows({ limit: 100 });
  let totalRevenue = 0;
  let totalCost = 0;
  let totalMargin = 0;
  let settledCount = 0;
  let inFlight = 0;
  let refunded = 0;
  let totalPlatformFee = 0;

  const settled = wfs.filter((w) => w.statusEnum === 3);
  const fees = await Promise.all(settled.map((w) => fetchSettlement(w.id)));
  for (const s of fees) totalPlatformFee += s?.platformFee ?? 0;

  for (const w of wfs) {
    totalRevenue += w.totalRevenue;
    totalCost += w.totalCost;
    totalMargin += w.margin;
    if (w.statusEnum === 3) settledCount += 1;
    else if (w.statusEnum === 5) refunded += 1;
    else inFlight += 1;
  }
  return {
    totalWorkflows: wfs.length,
    settledCount,
    totalRevenue,
    totalCost,
    totalMargin,
    totalPlatformFee,
    inFlight,
    refunded,
  };
}

// === Quotes ===

export type QuoteListItem = {
  id: string;
  productId: string;
  customer: string;
  price: number;
  pricingModel: number;
  successCriteriaHashHex: string;
  expiresAtMs: number;
  createdAtMs: number;
  /** Computed: whether the quote was actually used to start a workflow. */
  used: boolean;
  /** Computed display status. */
  status: "Active" | "Used" | "Expired";
};

export async function listQuotes(opts?: { limit?: number }): Promise<QuoteListItem[]> {
  const core = coreContract();
  const [nextQuote, workflows] = await Promise.all([
    core.nextQuoteId(),
    listWorkflows({ limit: 200 }),
  ]);
  const usedQuoteIds = new Set(workflows.map((w) => w.quoteId).filter(Boolean));

  const limit = opts?.limit ?? 50;
  const ids: number[] = [];
  for (let id = Number(nextQuote) - 1; id >= 1 && ids.length < limit; id--) ids.push(id);

  const now = Date.now();
  const rows = await Promise.all(
    ids.map(async (id) => {
      const q = await fetchQuote(String(id));
      if (!q) return null;
      const used = usedQuoteIds.has(String(id));
      const status: QuoteListItem["status"] = used
        ? "Used"
        : q.expiresAtMs > now
          ? "Active"
          : "Expired";
      return {
        id: String(id),
        productId: q.workflowProductId,
        customer: q.customer,
        price: q.price,
        pricingModel: q.pricingModel,
        successCriteriaHashHex: q.successCriteriaHashHex,
        expiresAtMs: q.expiresAtMs,
        createdAtMs: q.createdAtMs,
        used,
        status,
      };
    }),
  );
  return rows.filter((r): r is QuoteListItem => r !== null);
}

// === Settlements ===

export async function listSettlements(opts?: { limit?: number }): Promise<SettlementSummary[]> {
  const workflows = await listWorkflows({ limit: 200 });
  const settledIds = workflows
    .filter((w) => w.settlementId)
    .slice(0, opts?.limit ?? 50)
    .map((w) => w.id);
  const rows = await Promise.all(settledIds.map((id) => fetchSettlement(id)));
  return rows.filter((r): r is SettlementSummary => r !== null);
}

// === Customer aggregates ===

export type CustomerAggregate = {
  customer: string;
  workflowCount: number;
  totalSettled: number; // sum of revenue across settled workflows (= "GMV")
  totalEscrowed: number; // sum currently locked in escrow
  margin: number;
  refundedCount: number;
};

export async function customerAggregates(opts?: {
  limit?: number;
}): Promise<CustomerAggregate[]> {
  const workflows = await listWorkflows({ limit: opts?.limit ?? 100 });
  const map = new Map<string, CustomerAggregate>();
  for (const w of workflows) {
    const cur =
      map.get(w.customer) ?? {
        customer: w.customer,
        workflowCount: 0,
        totalSettled: 0,
        totalEscrowed: 0,
        margin: 0,
        refundedCount: 0,
      };
    cur.workflowCount += 1;
    cur.totalSettled += w.totalRevenue;
    cur.totalEscrowed += w.escrowBalance;
    cur.margin += w.margin;
    if (w.statusEnum === 5) cur.refundedCount += 1;
    map.set(w.customer, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.totalSettled - a.totalSettled);
}

// === Disputes ===

export type DisputeEventRow = {
  workflowId: string;
  outcomeId: string;
  evidenceBlobIdHex: string;
  filedBy: string;
  timestampMs: number;
};

export async function listDisputes(opts?: { limit?: number }): Promise<DisputeEventRow[]> {
  // Disputed workflows are derived from live status (evidence blob IDs live
  // in the DisputeFiled event + the indexed_disputes mirror written at
  // filing time by /api/evm/file-dispute).
  const workflows = await listWorkflows({ limit: opts?.limit ?? 100 });
  return workflows
    .filter((w) => w.statusEnum === 4)
    .map((w) => ({
      workflowId: w.id,
      outcomeId: w.outcomeId ?? w.id,
      evidenceBlobIdHex: "",
      filedBy: w.customer,
      timestampMs: w.updatedAtMs,
    }));
}

export type DisputeStats = {
  totalDisputes: number;
  totalSettled: number;
  /** Disputes as % of settled (0–100). */
  ratePct: number;
  /** Last 6 months bucketed by month label. */
  byMonth: Array<{ month: string; disputes: number; settlements: number; ratePct: number }>;
};

export async function disputeStats(): Promise<DisputeStats> {
  const workflows = await listWorkflows({ limit: 200 });
  const disputes = workflows.filter((w) => w.statusEnum === 4);
  const settled = workflows.filter((w) => w.statusEnum === 3);
  const total = disputes.length;
  const settledTotal = settled.length;
  const rate = settledTotal === 0 ? 0 : (total / settledTotal) * 100;

  const now = new Date();
  const months: Array<{ key: string; label: string; disputes: number; settlements: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString(undefined, { month: "short" });
    months.push({ key, label, disputes: 0, settlements: 0 });
  }
  const bucketKey = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  for (const d of disputes) {
    const bucket = months.find((m) => m.key === bucketKey(d.updatedAtMs));
    if (bucket) bucket.disputes += 1;
  }
  for (const s of settled) {
    const bucket = months.find((m) => m.key === bucketKey(s.updatedAtMs));
    if (bucket) bucket.settlements += 1;
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

// === Margin aggregates ===

export type MarginByProduct = {
  productId: string;
  workflowCount: number;
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  marginPct: number;
};

export async function marginByProduct(): Promise<MarginByProduct[]> {
  const workflows = await listWorkflows({ limit: 100 });
  const map = new Map<string, MarginByProduct>();
  for (const w of workflows) {
    if (w.statusEnum !== 3) continue; // only settled
    const cur =
      map.get(w.productId) ?? {
        productId: w.productId,
        workflowCount: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalMargin: 0,
        marginPct: 0,
      };
    cur.workflowCount += 1;
    cur.totalRevenue += w.totalRevenue;
    cur.totalCost += w.totalCost;
    cur.totalMargin += w.margin;
    map.set(w.productId, cur);
  }
  return Array.from(map.values()).map((m) => ({
    ...m,
    marginPct: m.totalRevenue === 0 ? 0 : (m.totalMargin / m.totalRevenue) * 100,
  }));
}
