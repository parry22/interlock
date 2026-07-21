import { NextResponse } from "next/server";
import { listWorkflows, marginByProduct } from "@/lib/db/queries";
import { effectiveOnChainAddress, getCurrentUser } from "@/lib/interlock/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  try {
    const [workflows, byProduct] = await Promise.all([
      listWorkflows({ limit: 100, customer: effectiveOnChainAddress(user) }),
      marginByProduct({ customer: effectiveOnChainAddress(user) }),
    ]);
    return NextResponse.json({
      workflows: workflows.map((w) => ({
        id: w.id,
        productId: w.productId,
        customer: w.customer,
        status: w.status,
        statusEnum: w.statusEnum,
        totalRevenue: w.totalRevenue,
        totalCost: w.totalCost,
        margin: w.margin,
        marginPct: w.totalRevenue === 0 ? 0 : (w.margin / w.totalRevenue) * 100,
        updatedAtMs: w.updatedAtMs,
      })),
      byProduct,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `query failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
