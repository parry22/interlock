import { NextResponse } from "next/server";
import { disputeStats, listDisputes } from "@/lib/db/queries";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  try {
    const [stats, recent] = await Promise.all([
      disputeStats({ customer: effectiveOnChainAddress(user) }),
      listDisputes({ limit: 20, customer: effectiveOnChainAddress(user) }),
    ]);
    return NextResponse.json({ stats, recent });
  } catch (e) {
    return NextResponse.json(
      { error: `query failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
