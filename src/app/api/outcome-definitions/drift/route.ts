// GET /api/outcome-definitions/drift[?agent=<slug>]
//
// Schema-drift guard. Re-derives each agent's CURRENT field schema and
// re-validates every saved definition against it. A definition that now
// references a field the agent no longer produces (provider changed their
// schema) is flipped to `needs_review` with a note naming the offending
// fields — so it's surfaced to a human instead of failing silently at
// verification time. Definitions that validate clean are (re)marked active.
//
// Safe to run on a cron. Idempotent.

import { NextRequest, NextResponse } from "next/server";

import { getAgentById, getAgentBySlug } from "@/lib/db/agents";
import {
  listOutcomeDefinitions,
  setOutcomeDefinitionStatus,
} from "@/lib/db/outcome-definitions";
import {
  type AgentLike,
  type AgentOutcomeSchema,
  deriveOutcomeSchema,
  validateCriterionAgainstSchema,
} from "@/lib/interlock/outcome-schema";
import { type SuccessCriterion } from "@/lib/interlock/dsl";

export const runtime = "nodejs";

type DriftReportItem = {
  id: number;
  agentId: number;
  previousStatus: string;
  newStatus: "active" | "needs_review";
  invalidPointers: string[];
  unsupportedTypes: string[];
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const slug = req.nextUrl.searchParams.get("agent");
  try {
    let agentId: number | undefined;
    if (slug) {
      const agent = await getAgentBySlug(slug);
      if (!agent) return NextResponse.json({ error: "agent not found" }, { status: 404 });
      agentId = agent.id;
    }

    const rows = await listOutcomeDefinitions(agentId);
    // Cache derived schemas per agent so we don't re-derive per row.
    const schemaCache = new Map<number, AgentOutcomeSchema | null>();
    const report: DriftReportItem[] = [];
    let flagged = 0;

    for (const row of rows) {
      let schema = schemaCache.get(row.agentId);
      if (schema === undefined) {
        const agent = (await getAgentById(row.agentId)) as AgentLike | null;
        schema = agent ? deriveOutcomeSchema(agent) : null;
        schemaCache.set(row.agentId, schema);
      }
      // If the agent itself is gone, treat as drift.
      if (!schema) {
        if (row.status !== "needs_review") {
          await setOutcomeDefinitionStatus(row.id, "needs_review", "agent no longer exists");
        }
        report.push({
          id: row.id,
          agentId: row.agentId,
          previousStatus: row.status,
          newStatus: "needs_review",
          invalidPointers: [],
          unsupportedTypes: [],
        });
        flagged++;
        continue;
      }

      const v = validateCriterionAgainstSchema(row.criterion as SuccessCriterion, schema);
      const newStatus: "active" | "needs_review" = v.ok ? "active" : "needs_review";
      if (newStatus !== row.status) {
        const note = v.ok
          ? null
          : `invalid fields: ${[...v.invalidPointers, ...v.unsupportedTypes].join(", ")}`;
        await setOutcomeDefinitionStatus(row.id, newStatus, note);
      }
      if (!v.ok) {
        flagged++;
        report.push({
          id: row.id,
          agentId: row.agentId,
          previousStatus: row.status,
          newStatus,
          invalidPointers: v.invalidPointers,
          unsupportedTypes: v.unsupportedTypes,
        });
      }
    }

    return NextResponse.json({ scanned: rows.length, flagged, drifted: report });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
