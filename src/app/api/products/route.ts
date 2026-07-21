// /api/products — self-serve product creation.
//
// A "product" is a job type you sell: a slug, a platform fee, and the payout
// address for your company. Creating one registers it on WeaveosCore so your
// customers can be quoted and settled against it. We submit the on-chain
// createProduct call with the platform admin key (the registry owner) but set
// the AGENT COMPANY to the signed-in user's own wallet — so revenue for their
// product flows to them, not the platform.
//
// GET  → list on-chain products
// POST → create a product for the signed-in user

import { NextResponse } from "next/server";
import { ethers } from "ethers";

import { getCurrentUser, effectiveOnChainAddress } from "@/lib/interlock/session";
import { registryContract, evmConfig } from "@/lib/interlock/evm";
import { createProduct } from "@/lib/interlock/products";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const me = effectiveOnChainAddress(user);

  try {
    const registry = registryContract();
    const next = Number(await registry.nextProductId());
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const products: any[] = [];
    for (let id = 1; id < next; id++) {
      const p = await registry.getProduct(id);
      products.push({
        id,
        slug: p.slug,
        agentCompany: String(p.agentCompany),
        feeBps: Number(p.feeBps),
        feeCap: Number(p.feeCap),
        feeMaxBps: Number(p.feeMaxBps),
        active: Boolean(p.active),
        mine: String(p.agentCompany).toLowerCase() === me.toLowerCase(),
      });
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return NextResponse.json({ products, defaultProductId: evmConfig.defaultProductId });
  } catch (e) {
    return NextResponse.json({ error: `chain read failed: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const limited = rateLimit(req, "products", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const me = effectiveOnChainAddress(user);
  if (!ethers.isAddress(me)) {
    return NextResponse.json({ error: "sign in again to provision a wallet first" }, { status: 400 });
  }

  type Body = { slug?: string; feeBps?: number; feeCapUsdc?: number };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    return NextResponse.json({ error: `invalid JSON: ${(e as Error).message}` }, { status: 400 });
  }

  try {
    const result = await createProduct({
      slug: (body.slug ?? "").trim(),
      agentCompany: me,
      feeBps: body.feeBps,
      feeCapUsdc: body.feeCapUsdc,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: `create product failed: ${(e as Error).message}` }, { status: 500 });
  }
}
