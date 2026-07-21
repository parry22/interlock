// /api/agents/[slug] — agent detail + recent fulfilled workflows.

import { NextRequest, NextResponse } from "next/server";

import { getAgentBySlug, listAgentWorkflows } from "@/lib/db/agents";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await ctx.params;
  try {
    const agent = await getAgentBySlug(slug);
    if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });
    const workflows = await listAgentWorkflows(agent.id, 10);
    return NextResponse.json({ agent, workflows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
