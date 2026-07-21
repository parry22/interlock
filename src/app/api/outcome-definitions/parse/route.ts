// POST /api/outcome-definitions/parse
// { agentSlug | agentId, text, prior? }
//
// Translate a plain-English rule (or a refinement of an existing definition)
// into a compiled, schema-grounded outcome definition. The LLM only ever
// translates + flags ambiguity here; the returned `criterion` is what the
// deterministic verifier runs. On success we also return the deterministic
// English summary for the confirmation step.

import { NextRequest, NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import {
  type CompiledOutcomeDefinition,
  parseOutcomeDefinition,
  summarizeDefinition,
} from "@/lib/interlock/outcome-nl";
import { resolveAgentSchema } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  agentSlug?: string;
  agentId?: number;
  text?: string;
  prior?: CompiledOutcomeDefinition;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = rateLimit(req, "outcome-parse", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  if (!body.text || !body.text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const resolved = await resolveAgentSchema({ agentSlug: body.agentSlug, agentId: body.agentId });
  if (!resolved) return NextResponse.json({ error: "agent not found" }, { status: 404 });

  const result = await parseOutcomeDefinition({
    text: body.text,
    schema: resolved.schema,
    prior: body.prior,
  });

  if (result.status === "ok") {
    return NextResponse.json({ ...result, summary: summarizeDefinition(result.definition) });
  }
  // needs_clarification / needs_config / error all return 200 with a status
  // field — they're expected flow states, not transport errors.
  return NextResponse.json(result);
}
