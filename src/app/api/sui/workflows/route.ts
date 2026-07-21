// Read-only listing of indexed workflows for the current user.
//
// Filter: indexed_workflows.customer = cookie.suiAddress.
// Unauthenticated callers receive a 401 (the page is gated by proxy.ts,
// but the API enforces independently).

import { NextResponse } from "next/server";
import { listWorkflows } from "@/lib/db/queries";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  try {
    const workflows = await listWorkflows({ limit: 50, customer: effectiveOnChainAddress(user) });
    return NextResponse.json({ workflows });
  } catch (e) {
    return NextResponse.json(
      { error: `query failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
