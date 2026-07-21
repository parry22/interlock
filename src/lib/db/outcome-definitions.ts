// CRUD for guided outcome definitions. Persistence only — the parsing,
// grounding, and drift logic live in src/lib/interlock/outcome-*.

import { desc, eq } from "drizzle-orm";

import { db, schema } from "./index";

export type OutcomeDefinitionRow = typeof schema.outcomeDefinitions.$inferSelect;

export async function saveOutcomeDefinition(input: {
  agentId: number;
  nlInput: string;
  structuredDef: unknown;
  criterion: unknown;
  criteriaHashHex: string;
  createdByAddress?: string | null;
}): Promise<OutcomeDefinitionRow> {
  const now = Date.now();
  const [row] = await db()
    .insert(schema.outcomeDefinitions)
    .values({
      agentId: input.agentId,
      nlInput: input.nlInput,
      structuredDef: input.structuredDef,
      criterion: input.criterion,
      criteriaHashHex: input.criteriaHashHex,
      createdByAddress: input.createdByAddress ?? null,
      status: "active",
      createdAtMs: now,
      updatedAtMs: now,
    })
    .returning();
  return row;
}

export async function listOutcomeDefinitions(agentId?: number): Promise<OutcomeDefinitionRow[]> {
  const q = db().select().from(schema.outcomeDefinitions);
  const rows = agentId
    ? await q.where(eq(schema.outcomeDefinitions.agentId, agentId)).orderBy(desc(schema.outcomeDefinitions.createdAtMs))
    : await q.orderBy(desc(schema.outcomeDefinitions.createdAtMs));
  return rows;
}

export async function listAllOutcomeDefinitions(): Promise<OutcomeDefinitionRow[]> {
  return listOutcomeDefinitions();
}

/** Flip a definition to needs_review (or back to active) after a drift scan. */
export async function setOutcomeDefinitionStatus(
  id: number,
  status: "active" | "needs_review",
  driftNote: string | null,
): Promise<void> {
  await db()
    .update(schema.outcomeDefinitions)
    .set({ status, driftNote, updatedAtMs: Date.now() })
    .where(eq(schema.outcomeDefinitions.id, id));
}
