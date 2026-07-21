// GET /api/outcome-definitions/schema?agent=<slug>
//
// Everything the guided builder needs to start for a chosen agent: the real
// field catalog (so the client can show which fields exist), grounded starter
// templates, the agent's sample outcome (for the test step), and whether NL
// parsing is available in this environment.

import { NextRequest, NextResponse } from "next/server";

import { starterTemplatesForAgent } from "@/lib/interlock/outcome-templates";
import { isLlmConfigured } from "@/lib/interlock/outcome-nl";
import { resolveAgentSchema } from "../_shared";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const slug = req.nextUrl.searchParams.get("agent");
  const idParam = req.nextUrl.searchParams.get("agentId");
  if (!slug && !idParam) {
    return NextResponse.json({ error: "agent (slug) or agentId is required" }, { status: 400 });
  }
  const resolved = await resolveAgentSchema({
    agentSlug: slug ?? undefined,
    agentId: idParam ? Number(idParam) : undefined,
  });
  if (!resolved) return NextResponse.json({ error: "agent not found" }, { status: 404 });

  return NextResponse.json({
    schema: resolved.schema,
    templates: starterTemplatesForAgent(resolved.schema),
    llmConfigured: isLlmConfigured(),
  });
}
