// POST /api/outcome-definitions/compile
// { agentSlug | agentId, criterion }
//
// Recompile a hand-edited (advanced view) or template criterion into a full
// definition + deterministic English summary, WITHOUT the LLM. Used by the
// power-user escape hatch: the user edits the structured criterion directly and
// we regenerate the confirmation summary from it, keeping "what you see" equal
// to "what will run". Rejects any criterion referencing a field the agent's
// schema can't verify.

import { NextRequest, NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import { type SuccessCriterion } from "@/lib/interlock/dsl";
import {
  type CompiledOutcomeDefinition,
  buildDefinition,
  decomposeCriterion,
  summarizeDefinition,
} from "@/lib/interlock/outcome-nl";
import { validateCriterionAgainstSchema } from "@/lib/interlock/outcome-schema";
import { resolveAgentSchema } from "../_shared";

export const runtime = "nodejs";

type Body = { agentSlug?: string; agentId?: number; criterion?: SuccessCriterion };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = rateLimit(req, "outcome-compile", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  if (!body.criterion || typeof body.criterion !== "object") {
    return NextResponse.json({ error: "criterion object is required" }, { status: 400 });
  }

  const resolved = await resolveAgentSchema({ agentSlug: body.agentSlug, agentId: body.agentId });
  if (!resolved) return NextResponse.json({ error: "agent not found" }, { status: 404 });

  const validation = validateCriterionAgainstSchema(body.criterion, resolved.schema);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "criterion references fields the agent's schema can't verify",
        invalidPointers: validation.invalidPointers,
        unsupportedTypes: validation.unsupportedTypes,
        knownFields: resolved.schema.fields.map((f) => f.pointer),
      },
      { status: 422 },
    );
  }

  // Try to render it back as editable conditions so the summary is faithful.
  const conditions = decomposeCriterion(body.criterion);
  let definition: CompiledOutcomeDefinition;
  let summary: string;
  let decomposed = false;

  if (conditions) {
    definition = buildDefinition({ triggerEvent: "Custom rule", conditions });
    summary = summarizeDefinition(definition);
    decomposed = true;
  } else {
    // Shapes the guided view can't represent (json_schema, nested any_of).
    // Keep it usable via the advanced view; just no auto-summary.
    definition = {
      triggerEvent: "Custom rule",
      conditions: [],
      reversal: null,
      reversalRule: null,
      verificationWindowSeconds: null,
      criterion: body.criterion,
    };
    summary = "Advanced criterion — no plain-English summary available. Review the structured view directly.";
  }

  return NextResponse.json({ definition, summary, decomposed });
}
