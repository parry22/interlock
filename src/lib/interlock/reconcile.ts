// Cost reconciliation against provider rate cards.
//
// Every reported cost line names a provider, a category, units of work, and an
// amount. A provider publishes a rate card (max micro-USDC per unit per
// category). Reconciliation checks that each claimed amount doesn't exceed the
// provider's own published rate for that work. This closes the "claim any cost
// to a registered address" gap: a colluding integration still can't pay a
// provider more than that provider says it charges.
//
// Providers with no rate on file are reported as "unpriced" — allowed for now
// (not every provider has published rates on a testnet), but flagged in the
// proof so the drift is visible and auditable.

import { and, eq, inArray } from "drizzle-orm";
import { db, providerRates } from "@/lib/db";

export type ReportedCost = {
  provider: string;
  category: number;
  units: number;
  amount: number; // micro-USDC
};

export type CostReconLine = ReportedCost & {
  status: "ok" | "over_rate" | "unpriced";
  maxAllowed?: number; // units × published rate
  ratePerUnit?: number;
};

export type ReconResult = {
  lines: CostReconLine[];
  /** True if every priced line is within its rate. Unpriced lines don't fail. */
  ok: boolean;
  /** Lines that exceeded their published rate. */
  violations: CostReconLine[];
};

/** Reconcile reported costs against on-file provider rates. */
export async function reconcileCosts(reported: ReportedCost[]): Promise<ReconResult> {
  if (reported.length === 0) return { lines: [], ok: true, violations: [] };

  const providers = Array.from(new Set(reported.map((c) => c.provider.toLowerCase())));
  const rows = await db()
    .select()
    .from(providerRates)
    .where(inArray(providerRates.providerAddress, providers));

  // (provider|category) -> maxPerUnitMicro
  const rateMap = new Map<string, number>();
  for (const r of rows) {
    rateMap.set(`${r.providerAddress.toLowerCase()}|${r.category}`, r.maxPerUnitMicro);
  }

  const lines: CostReconLine[] = reported.map((c) => {
    const key = `${c.provider.toLowerCase()}|${c.category}`;
    const ratePerUnit = rateMap.get(key);
    if (ratePerUnit === undefined) {
      return { ...c, status: "unpriced" };
    }
    const maxAllowed = ratePerUnit * Math.max(c.units, 0);
    if (c.amount > maxAllowed) {
      return { ...c, status: "over_rate", maxAllowed, ratePerUnit };
    }
    return { ...c, status: "ok", maxAllowed, ratePerUnit };
  });

  const violations = lines.filter((l) => l.status === "over_rate");
  return { lines, ok: violations.length === 0, violations };
}

/** Look up a single provider rate (for the rates admin API). */
export async function getProviderRate(
  provider: string,
  category: number,
): Promise<number | null> {
  const rows = await db()
    .select()
    .from(providerRates)
    .where(
      and(
        eq(providerRates.providerAddress, provider.toLowerCase()),
        eq(providerRates.category, category),
      ),
    )
    .limit(1);
  return rows[0]?.maxPerUnitMicro ?? null;
}
