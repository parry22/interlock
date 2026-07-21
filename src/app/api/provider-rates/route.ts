// /api/provider-rates — publish and view provider rate cards.
//
// A provider (or the platform admin) publishes the maximum price they charge
// per unit of work, per category. The verifier reconciles every reported cost
// against these, so a cost line can never claim more than the provider's own
// published rate.
//
// GET  → list all rate cards
// POST → upsert a rate  { providerAddress, category, maxPerUnitMicro, label? }

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

import { db, providerRates } from "@/lib/db";
import { getCurrentUser, effectiveOnChainAddress } from "@/lib/interlock/session";
import { registryContract } from "@/lib/interlock/evm";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await db().select().from(providerRates);
    return NextResponse.json({ rates: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = rateLimit(req, "provider-rates", { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  type Body = {
    providerAddress?: string;
    category?: number;
    maxPerUnitMicro?: number;
    label?: string;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }

  const provider = (body.providerAddress ?? "").toLowerCase();
  if (!ethers.isAddress(provider)) {
    return NextResponse.json({ error: "providerAddress must be a valid address" }, { status: 400 });
  }
  const category = Number(body.category);
  if (![0, 1, 2, 3].includes(category)) {
    return NextResponse.json({ error: "category must be 0..3" }, { status: 400 });
  }
  const maxPerUnitMicro = Number(body.maxPerUnitMicro);
  if (!Number.isFinite(maxPerUnitMicro) || maxPerUnitMicro < 0) {
    return NextResponse.json({ error: "maxPerUnitMicro must be >= 0" }, { status: 400 });
  }

  // Only the provider themselves or the platform admin can set a rate.
  const me = effectiveOnChainAddress(user).toLowerCase();
  const adminAddr = (await registryContract().admin()).toLowerCase();
  if (me !== provider && me !== adminAddr) {
    return NextResponse.json(
      { error: "you can only publish rates for your own provider address" },
      { status: 403 },
    );
  }

  try {
    await db()
      .insert(providerRates)
      .values({
        providerAddress: provider,
        category,
        maxPerUnitMicro,
        label: body.label ?? null,
        updatedAtMs: Date.now(),
      })
      .onConflictDoUpdate({
        target: [providerRates.providerAddress, providerRates.category],
        set: { maxPerUnitMicro, label: body.label ?? null, updatedAtMs: Date.now() },
      });
    return NextResponse.json({ ok: true, providerAddress: provider, category, maxPerUnitMicro });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
