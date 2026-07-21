// Tests cost reconciliation: honest costs (within the provider's rate card)
// verify OK; inflated costs get rejected 422. Needs the dev server on :3005.
//   node --env-file=.env.local backend/scripts/test-reconcile.mjs

import { ethers } from "ethers";

const RPC = "https://api.avax-test.network/ext/bc/C/rpc";
const CORE = "0x27C23b7921ACf27fb2E3778C9A13436A0a8ac947";
const USDC = "0x598279AE42F7A55aB2Ef7a081c9CA11C7b572F79";
const BASE = "http://localhost:3005";
const PRICE = 10_000_000;
const provider = new ethers.JsonRpcProvider(RPC, 43113, { staticNetwork: true });
const customer = new ethers.Wallet(process.env.INTERLOCK_CUSTOMER_PRIVKEY, provider);
const DEMO_PROVIDER = "0x584b37cA94889a0cd905c9e8dB3670bbBCDE73bD";

const core = new ethers.Contract(CORE, [
  `function createQuote(uint256,address,uint64,uint8,bytes,uint64,bytes) returns (uint256)`,
  `function createWorkflowFromQuote(uint256,uint256) returns (uint256)`,
  `event QuoteCreated(uint256 indexed quoteId,uint256 indexed productId,address indexed customer,uint64,uint8,uint64)`,
  `event WorkflowCreated(uint256 indexed workflowId,address indexed customer,uint256 indexed productId,uint256,uint256)`,
], customer);
const usdc = new ethers.Contract(USDC, [`function approve(address,uint256) returns (bool)`], customer);

const criteria = { type: "exact", path: "/ok", value: true };
const outcome = { ok: true };

async function ev(rc, name) {
  for (const log of rc.logs) { try { const p = core.interface.parseLog({ topics:[...log.topics], data: log.data }); if (p?.name===name) return p.args; } catch {} }
}

async function main() {
  let tx = await core.createQuote(1, customer.address, PRICE, 0, ethers.toUtf8Bytes(JSON.stringify(criteria)), Date.now()+3600_000, "0x");
  const quoteId = (await ev(await tx.wait(), "QuoteCreated")).quoteId;
  await (await usdc.approve(CORE, PRICE)).wait();
  tx = await core.createWorkflowFromQuote(quoteId, PRICE);
  const workflowId = (await ev(await tx.wait(), "WorkflowCreated")).workflowId;
  console.log("workflow", workflowId.toString());

  const verify = (costTrace) => fetch(`${BASE}/api/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId: workflowId.toString(), criteria, outcome, costTrace, disputeWindowSeconds: 10 }),
  });

  // Honest: model 8000 units @ 1.5 USDC → 187.5/unit ≤ 250 rate. OK.
  const honest = [{ provider: DEMO_PROVIDER, category: 0, units: 8000, amount: 1_500_000 }];
  const r1 = await verify(honest);
  console.log("honest costs →", r1.status, r1.ok ? "(verified)" : "(rejected)");

  // Inflated: model 10 units @ 5 USDC → 500_000/unit ≫ 250 rate. Should reject.
  const inflated = [{ provider: DEMO_PROVIDER, category: 0, units: 10, amount: 5_000_000 }];
  const r2 = await verify(inflated);
  const body2 = await r2.json();
  console.log("inflated costs →", r2.status, r2.status === 422 ? "(rejected ✓)" : "(NOT rejected ✗)");
  if (r2.status === 422) console.log("  reason:", body2.error);

  if (r1.ok && r2.status === 422) console.log("\n✓ reconciliation works: honest passes, inflated rejected");
  else { console.log("\n✗ reconciliation not behaving as expected"); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
