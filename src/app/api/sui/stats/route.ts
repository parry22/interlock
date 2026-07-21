// Aggregate dashboard stats scoped to the current user.

import { NextResponse } from "next/server";
import { dashboardStats } from "@/lib/db/queries";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  try {
    const stats = await dashboardStats({ customer: effectiveOnChainAddress(user) });
    return NextResponse.json({ stats });
  } catch (e) {
    return NextResponse.json(
      { error: `query failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
