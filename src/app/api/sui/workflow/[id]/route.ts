// Single Workflow detail — fetches linked Quote / Execution / Outcome /
// Settlement objects in parallel.

import { NextRequest, NextResponse } from "next/server";
import { getWorkflow } from "@/lib/interlock/queries";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  // WeaveosCore assigns sequential integer workflow IDs.
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "expected a numeric workflow ID" }, { status: 400 });
  }
  try {
    const workflow = await getWorkflow(id);
    if (!workflow) return NextResponse.json({ error: "not found" }, { status: 404 });
    // Authorisation: the workflow's customer must be the signed-in user.
    if (workflow.customer.toLowerCase() !== effectiveOnChainAddress(user).toLowerCase()) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ workflow });
  } catch (e) {
    return NextResponse.json(
      { error: `chain read failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
