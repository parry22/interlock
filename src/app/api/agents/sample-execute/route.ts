// /api/agents/sample-execute — a built-in demo agent.
//
// This is a real, working execution endpoint you can point a registered agent
// at to see the full "platform runs your agent" flow without hosting anything
// yourself. Given a task + success criteria, it produces an outcome that
// satisfies the criteria and reports plausible costs. Your own agent endpoint
// would do the actual work here and return its real result in the same shape.
//
// Contract (same one your endpoint should honor):
//   POST { taskInput, criteria, priceBaseUnits }
//   → 200 { outcome, costItems }

import { NextRequest, NextResponse } from "next/server";

import type { SuccessCriterion } from "@/lib/interlock/dsl";
import { registryContract } from "@/lib/interlock/evm";

export const runtime = "nodejs";

type Body = {
  taskInput?: unknown;
  criteria?: SuccessCriterion;
  priceBaseUnits?: number;
};

/** Write a value at an RFC 6901 JSON Pointer into `obj` (creating objects). */
function setAtPointer(obj: Record<string, unknown>, pointer: string, value: unknown): void {
  const parts = pointer
    .split("/")
    .slice(1)
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/** Build an outcome object that satisfies the (deterministic) criteria. */
function satisfy(criteria: SuccessCriterion, out: Record<string, unknown>): void {
  switch (criteria.type) {
    case "exact":
      setAtPointer(out, criteria.path, criteria.value);
      break;
    case "numeric_threshold": {
      const v = criteria.value;
      let chosen = v;
      switch (criteria.op) {
        case "<": chosen = v - 1; break;
        case "<=": chosen = v; break;
        case ">": chosen = v + 1; break;
        case ">=": chosen = v; break;
        case "==": chosen = v; break;
        case "!=": chosen = v + 1; break;
      }
      setAtPointer(out, criteria.path, chosen);
      break;
    }
    case "regex":
      // Best effort: satisfy a trivial pattern; otherwise leave for the caller.
      setAtPointer(out, criteria.path, "");
      break;
    case "all_of":
      for (const c of criteria.criteria) satisfy(c, out);
      break;
    case "any_of":
      if (criteria.criteria[0]) satisfy(criteria.criteria[0], out);
      break;
    default:
      break; // json_schema / semantic_match / not — not auto-satisfiable here
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }
  if (!body.criteria) {
    return NextResponse.json({ error: "criteria required" }, { status: 400 });
  }

  // Do the "work": produce an outcome that meets the criteria.
  const outcome: Record<string, unknown> = {
    completed: true,
    summary: `Sample agent handled: ${typeof body.taskInput === "string" ? body.taskInput.slice(0, 120) : "task"}`,
  };
  satisfy(body.criteria, outcome);

  // Report costs against a registered provider (the platform's demo provider)
  // so the multi-party split settles. A real agent reports its own providers.
  let provider = "0x584b37cA94889a0cd905c9e8dB3670bbBCDE73bD";
  try {
    provider = await registryContract().admin();
  } catch {
    // fall back to the known deployer address above
  }

  const costItems = [
    { provider, category: 0, units: 8000, amount: 1_500_000 }, // model, 1.5 USDC
    { provider, category: 1, units: 2, amount: 400_000 }, // tool, 0.4 USDC
  ];

  return NextResponse.json({ outcome, costItems });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    agent: "interlock sample agent",
    usage: "POST { taskInput, criteria, priceBaseUnits } → { outcome, costItems }",
    note: "Point a registered agent's execution endpoint here to try the real run flow.",
  });
}
