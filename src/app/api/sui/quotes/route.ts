import { NextResponse } from "next/server";
import { listQuotes } from "@/lib/db/queries";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  try {
    const quotes = await listQuotes({ limit: 50, customer: effectiveOnChainAddress(user) });
    return NextResponse.json({ quotes });
  } catch (e) {
    return NextResponse.json(
      { error: `query failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
