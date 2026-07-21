// /api/outcome-definitions
//   GET  ?agent=<slug>   → saved definitions for an agent (or all)
//   POST { agentSlug|agentId, nlInput, definition } → persist a definition
//
// Save-time invariants:
//   • The compiled criterion is re-validated against the agent's CURRENT field
//     schema — a definition that references a nonexistent field is rejected,
//     never stored.
//   • Both the natural-language input AND the compiled definition/criterion are
//     persisted (audit requirement). The verifier only ever runs `criterion`.

import { NextRequest, NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser, effectiveOnChainAddress } from "@/lib/interlock/session";
import { type CompiledOutcomeDefinition } from "@/lib/interlock/outcome-nl";
import { validateCriterionAgainstSchema } from "@/lib/interlock/outcome-schema";
import {
  saveOutcomeDefinition,
  listOutcomeDefinitions,
} from "@/lib/db/outcome-definitions";
import { getAgentBySlug } from "@/lib/db/agents";
import { resolveAgentSchema, criteriaHash } from "./_shared";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const slug = req.nextUrl.searchParams.get("agent");
  try {
    let agentId: number | undefined;
    if (slug) {
      const agent = await getAgentBySlug(slug);
      if (!agent) return NextResponse.json({ error: "agent not found" }, { status: 404 });
      agentId = agent.id;
    }
    const definitions = await listOutcomeDefinitions(agentId);
    return NextResponse.json({ definitions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

type PostBody = {
  agentSlug?: string;
  agentId?: number;
  nlInput?: string;
  definition?: CompiledOutcomeDefinition;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = rateLimit(req, "outcome-save", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  if (!body.definition || !body.definition.criterion) {
    return NextResponse.json({ error: "definition (with criterion) is required" }, { status: 400 });
  }
  if (!body.nlInput || !body.nlInput.trim()) {
    return NextResponse.json({ error: "nlInput is required for the audit trail" }, { status: 400 });
  }

  const resolved = await resolveAgentSchema({ agentSlug: body.agentSlug, agentId: body.agentId });
  if (!resolved) return NextResponse.json({ error: "agent not found" }, { status: 404 });

  // Re-validate against the agent's current schema — do not trust the client.
  const validation = validateCriterionAgainstSchema(body.definition.criterion, resolved.schema);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "definition references fields the agent's schema can't verify",
        invalidPointers: validation.invalidPointers,
        unsupportedTypes: validation.unsupportedTypes,
      },
      { status: 422 },
    );
  }

  let createdBy: string | null = null;
  try {
    const user = await getCurrentUser();
    if (user) createdBy = effectiveOnChainAddress(user);
  } catch {
    // Unauthenticated saves are allowed in the demo; createdBy stays null.
  }

  try {
    const row = await saveOutcomeDefinition({
      agentId: resolved.agent.id,
      nlInput: body.nlInput,
      structuredDef: body.definition,
      criterion: body.definition.criterion,
      criteriaHashHex: criteriaHash(body.definition.criterion),
      createdByAddress: createdBy,
    });
    return NextResponse.json({ ok: true, definition: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
