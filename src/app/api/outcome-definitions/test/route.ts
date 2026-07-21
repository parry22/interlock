// POST /api/outcome-definitions/test
// { agentSlug | agentId, criterion, outcome? }
//
// Dry-run a definition against sample data BEFORE it goes live. If `outcome`
// is omitted we use the agent's declared example outcome. Returns whether it
// would have fired plus the full per-condition trace, so a schema mismatch or
// misread intent is caught here rather than at settlement time.

import { NextRequest, NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import { type SuccessCriterion, evaluate } from "@/lib/interlock/dsl";
import { resolveAgentSchema } from "../_shared";

export const runtime = "nodejs";

type Body = {
  agentSlug?: string;
  agentId?: number;
  criterion?: SuccessCriterion;
  outcome?: unknown;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = rateLimit(req, "outcome-test", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  if (!body.criterion) {
    return NextResponse.json({ error: "criterion is required" }, { status: 400 });
  }

  const resolved = await resolveAgentSchema({ agentSlug: body.agentSlug, agentId: body.agentId });
  if (!resolved) return NextResponse.json({ error: "agent not found" }, { status: 404 });

  const providedOutcome = body.outcome !== undefined;
  const outcome = providedOutcome ? body.outcome : resolved.schema.exampleOutcome;

  let evalResult;
  try {
    evalResult = evaluate(body.criterion, outcome);
  } catch (e) {
    return NextResponse.json(
      { error: `could not evaluate: ${(e as Error).message}` },
      { status: 422 },
    );
  }

  return NextResponse.json({
    wouldFire: evalResult.result,
    steps: evalResult.steps,
    outcomeUsed: outcome,
    source: providedOutcome ? "provided" : "agent_sample",
  });
}
