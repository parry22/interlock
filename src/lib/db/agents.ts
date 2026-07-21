// Agent-marketplace read helpers.
//
// Joins the off-chain agents table to the on-chain workflow mirror via
// workflow_agent_links to compute each agent's track record (total settled,
// dispute count, refund count). The reads here are bounded; the marketplace
// pages stay sub-100ms even when the listing is unpaginated.

import { sql, desc, eq, asc, ilike, or, and, inArray } from "drizzle-orm";

import { db, agents, workflowAgentLinks, indexedWorkflows, indexedSettlements, indexedDisputes } from "./index";
import type { Agent } from "./schema";

// Same shape used by the on-chain pages so the UI can lift workflow rows
// straight onto the agent's track record without re-mapping.

export type AgentTrackRecord = {
  settledCount: number;
  refundedCount: number;
  disputeCount: number;
  totalRevenue: number;
  totalSettled: number;
};

export type AgentListItem = Agent & { track: AgentTrackRecord };

const ZERO_TRACK: AgentTrackRecord = {
  settledCount: 0,
  refundedCount: 0,
  disputeCount: 0,
  totalRevenue: 0,
  totalSettled: 0,
};

/**
 * List active agents in the marketplace.
 *
 * `taskTag` filters by exact tag membership.
 * `q` does a fuzzy match against name/description (ILIKE %q% — good enough
 * for hackathon scale; we can swap in trigram or pgvector later).
 */
export async function listAgents(opts?: {
  taskTag?: string;
  q?: string;
  limit?: number;
}): Promise<AgentListItem[]> {
  const conds = [eq(agents.status, "active")];
  if (opts?.q && opts.q.trim()) {
    const pat = `%${opts.q.trim()}%`;
    conds.push(
      or(ilike(agents.name, pat), ilike(agents.description, pat)) as ReturnType<typeof eq>,
    );
  }
  const rows = await db()
    .select()
    .from(agents)
    .where(and(...conds))
    .orderBy(desc(agents.createdAtMs))
    .limit(opts?.limit ?? 100);

  // Drop tag-filtered out rows after fetch (small table, trivial cost).
  const filtered = opts?.taskTag
    ? rows.filter((r) => (r.taskTags as string[]).includes(opts.taskTag!))
    : rows;

  const tracks = await agentTrackRecords(filtered.map((r) => r.id));
  return filtered.map((r) => ({ ...r, track: tracks.get(r.id) ?? ZERO_TRACK }));
}

export async function getAgentBySlug(slug: string): Promise<AgentListItem | null> {
  const rows = await db().select().from(agents).where(eq(agents.slug, slug)).limit(1);
  if (rows.length === 0) return null;
  const tracks = await agentTrackRecords([rows[0].id]);
  return { ...rows[0], track: tracks.get(rows[0].id) ?? ZERO_TRACK };
}

/** Fetch a single agent by numeric id (no track record). Used when running one. */
export async function getAgentById(id: number): Promise<Agent | null> {
  const rows = await db().select().from(agents).where(eq(agents.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Per-agent track record by joining workflow_agent_links → indexed_workflows. */
export async function agentTrackRecords(
  ids: number[],
): Promise<Map<number, AgentTrackRecord>> {
  const out = new Map<number, AgentTrackRecord>();
  if (ids.length === 0) return out;

  // Fetch the links + their workflow IDs.
  const links = await db()
    .select()
    .from(workflowAgentLinks)
    .where(inArray(workflowAgentLinks.agentId, ids));
  if (links.length === 0) return out;

  const workflowIds = links.map((l) => l.workflowId);
  const [workflows, disputes] = await Promise.all([
    db().select().from(indexedWorkflows).where(inArray(indexedWorkflows.id, workflowIds)),
    db().select().from(indexedDisputes).where(inArray(indexedDisputes.workflowId, workflowIds)),
  ]);
  const wfById = new Map(workflows.map((w) => [w.id, w]));
  const disputeCountByWorkflow = new Map<string, number>();
  for (const d of disputes) {
    disputeCountByWorkflow.set(d.workflowId, (disputeCountByWorkflow.get(d.workflowId) ?? 0) + 1);
  }

  for (const link of links) {
    const w = wfById.get(link.workflowId);
    if (!w) continue;
    const prev = out.get(link.agentId) ?? { ...ZERO_TRACK };
    prev.totalRevenue += w.totalRevenue;
    if (w.status === 3) {
      prev.settledCount += 1;
      prev.totalSettled += w.totalRevenue;
    } else if (w.status === 5) {
      prev.refundedCount += 1;
    }
    if ((disputeCountByWorkflow.get(link.workflowId) ?? 0) > 0) {
      prev.disputeCount += 1;
    }
    out.set(link.agentId, prev);
  }
  return out;
}

/** Workflows fulfilled by a given agent, with their on-chain status. */
export async function listAgentWorkflows(agentId: number, limit = 20) {
  const links = await db()
    .select()
    .from(workflowAgentLinks)
    .where(eq(workflowAgentLinks.agentId, agentId))
    .orderBy(desc(workflowAgentLinks.createdAtMs))
    .limit(limit);
  if (links.length === 0) return [];
  const wfIds = links.map((l) => l.workflowId);
  const rows = await db()
    .select()
    .from(indexedWorkflows)
    .where(inArray(indexedWorkflows.id, wfIds));
  const byId = new Map(rows.map((w) => [w.id, w]));
  return links.map((l) => ({ link: l, workflow: byId.get(l.workflowId) ?? null }));
}

/** Tags appearing on at least one active agent, sorted by frequency. */
export async function listTags(): Promise<Array<{ tag: string; count: number }>> {
  const rows = await db()
    .select({ tags: agents.taskTags })
    .from(agents)
    .where(eq(agents.status, "active"));
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const t of r.tags as string[]) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/** Insert an off-chain link tagging a workflow as "fulfilled by this agent". */
export async function linkWorkflowToAgent(workflowId: string, agentId: number): Promise<void> {
  await db()
    .insert(workflowAgentLinks)
    .values({ workflowId, agentId, createdAtMs: Date.now() })
    .onConflictDoNothing();
}

// Re-export for routes.
export { asc };
