// Shared helpers for the outcome-definition routes.

import { createHash } from "node:crypto";

import { getAgentBySlug, getAgentById } from "@/lib/db/agents";
import { encodeCriteriaBytes, type SuccessCriterion } from "@/lib/interlock/dsl";
import {
  type AgentLike,
  type AgentOutcomeSchema,
  deriveOutcomeSchema,
} from "@/lib/interlock/outcome-schema";

export type ResolvedAgent = {
  agent: AgentLike;
  schema: AgentOutcomeSchema;
};

/** Resolve an agent (by slug or numeric id) and derive its outcome schema.
 *  Returns null when the agent doesn't exist. */
export async function resolveAgentSchema(
  ref: { agentSlug?: string; agentId?: number } | null,
): Promise<ResolvedAgent | null> {
  if (!ref) return null;
  let row: AgentLike | null = null;
  if (typeof ref.agentId === "number" && Number.isFinite(ref.agentId)) {
    row = (await getAgentById(ref.agentId)) as AgentLike | null;
  } else if (ref.agentSlug) {
    row = (await getAgentBySlug(ref.agentSlug)) as AgentLike | null;
  }
  if (!row) return null;
  return { agent: row, schema: deriveOutcomeSchema(row) };
}

/** Canonical criteria hash — identical to what /api/verify computes, so a
 *  definition authored here binds to the on-chain quote. */
export function criteriaHash(criterion: SuccessCriterion): string {
  return "0x" + createHash("sha256").update(encodeCriteriaBytes(criterion)).digest("hex");
}
