import { NextResponse } from "next/server";
import { customerAggregates } from "@/lib/db/queries";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  try {
    // Per-tenant: this returns at most one row — the current user's own aggregate.
    // For the "Customers" directory page it surfaces the user's own activity in
    // the same shape the dashboard chart expects.
    const customers = await customerAggregates({ limit: 100, customer: effectiveOnChainAddress(user) });
    return NextResponse.json({ customers });
  } catch (e) {
    return NextResponse.json(
      { error: `query failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
