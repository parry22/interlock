// End-to-end test of the "platform runs your agent" path on Fuji:
//   sample agent executes -> real outcome -> verify (criteria hash-bound)
//   -> settle. Mirrors what /api/workflows/start does for a registered agent.
//
// Run (dev server must be up on :3005):
//   node --env-file=.env.local backend/scripts/test-agent-run.mjs

import { ethers } from "ethers";

const RPC = "https://api.avax-test.network/ext/bc/C/rpc";
const CORE = process.env.INTERLOCK_CORE_ADDRESS ?? "0x27C23b7921ACf27fb2E3778C9A13436A0a8ac947";
const USDC = process.env.INTERLOCK_USDC_ADDRESS ?? "0x598279AE42F7A55aB2Ef7a081c9CA11C7b572F79";
const BASE = "http://localhost:3005";
const PRODUCT_ID = 1;
const PRICE = 10_000_000;

const provider = new ethers.JsonRpcProvider(RPC, 43113, { staticNetwork: true });
const customer = new ethers.Wallet(process.env.INTERLOCK_CUSTOMER_PRIVKEY, provider);

const COST_ITEM = "tuple(address provider,uint8 category,uint64 units,uint64 amount)";
const SPLIT = "tuple(address recipient,uint64 amount,uint8 role)";
const DEV_ATT = "tuple(address signer,bytes signature)";
const PAYLOAD =
  `tuple(uint256 workflowId,bool outcomeSuccess,bytes outcomeBlobId,bytes traceBlobId,` +
  `bytes proofBlobId,${COST_ITEM}[] reconciledCostItems,${SPLIT}[] splits,` +
  `uint64 platformFee,bytes32 nonce,uint64 timestampMs)`;

const core = new ethers.Contract(CORE, [
  `function createQuote(uint256,address,uint64,uint8,bytes,uint64,bytes) returns (uint256)`,
  `function createWorkflowFromQuote(uint256,uint256) returns (uint256)`,
  `function recordExecution(uint256,uint64,${COST_ITEM}[],bytes)`,
  `function verifyAndRecordOutcomeDev(uint256,${PAYLOAD},${DEV_ATT}[],uint64)`,
  `function settleWorkflowDev(uint256,${PAYLOAD},${DEV_ATT}[])`,
  `function disputeWindowClosed(uint256) view returns (bool)`,
  `function nextWorkflowId() view returns (uint256)`,
  `event QuoteCreated(uint256 indexed quoteId,uint256 indexed productId,address indexed customer,uint64,uint8,uint64)`,
  `event WorkflowCreated(uint256 indexed workflowId,address indexed customer,uint256 indexed productId,uint256,uint256)`,
], customer);
const usdc = new ethers.Contract(USDC, [`function approve(address,uint256) returns (bool)`, `function balanceOf(address) view returns (uint256)`], customer);

const criteria = {
  type: "all_of",
  criteria: [
    { type: "exact", path: "/ticket_status", value: "closed" },
    { type: "numeric_threshold", path: "/refund_amount", op: "<=", value: 100 },
  ],
};

function encodeCriteria(c) { return ethers.toUtf8Bytes(JSON.stringify(c)); }
function blob(s) { return ethers.toUtf8Bytes(s); }

async function findEvent(receipt, name) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== CORE.toLowerCase()) continue;
    try { const p = core.interface.parseLog({ topics: [...log.topics], data: log.data }); if (p?.name === name) return p.args; } catch {}
  }
  return null;
}

async function main() {
  console.log("customer:", customer.address, "USDC:", ethers.formatUnits(await usdc.balanceOf(customer.address), 6));

  // 0. Agent runs (the platform calls the agent's endpoint).
  const runResp = await fetch(`${BASE}/api/agents/sample-execute`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskInput: "Close refund ticket 4821", criteria, priceBaseUnits: PRICE }),
  });
  const run = await runResp.json();
  console.log("[agent] outcome:", JSON.stringify(run.outcome));

  // 1. Quote
  let tx = await core.createQuote(PRODUCT_ID, customer.address, PRICE, 0, encodeCriteria(criteria), Date.now() + 3600_000, "0x");
  let rc = await tx.wait();
  const quoteId = (await findEvent(rc, "QuoteCreated")).quoteId;
  console.log("[quote]", quoteId.toString());

  // 2. Workflow + escrow
  await (await usdc.approve(CORE, PRICE)).wait();
  tx = await core.createWorkflowFromQuote(quoteId, PRICE);
  rc = await tx.wait();
  const workflowId = (await findEvent(rc, "WorkflowCreated")).workflowId;
  console.log("[workflow]", workflowId.toString());

  // 3. Execution (real cost items from the agent)
  tx = await core.recordExecution(workflowId, Date.now() - 5000, run.costItems, blob("agent_trace"));
  await tx.wait();
  console.log("[execution] recorded", run.costItems.length, "cost items");

  // 4. Verify (real outcome; verifier binds criteria hash to the quote)
  const vResp = await fetch(`${BASE}/api/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId: workflowId.toString(), criteria, outcome: run.outcome, costTrace: run.costItems, disputeWindowSeconds: 12 }),
  });
  if (!vResp.ok) throw new Error(`verify ${vResp.status}: ${await vResp.text()}`);
  const v = await vResp.json();
  console.log("[verify] success:", v.success, "splits:", v.splits.length);

  const payload = {
    workflowId: BigInt(workflowId), outcomeSuccess: v.success,
    outcomeBlobId: blob(v.outcomeBlobId), traceBlobId: blob(v.traceBlobId), proofBlobId: blob(v.proofBlobId),
    reconciledCostItems: v.reconciledCostItems, splits: v.splits, platformFee: v.platformFee, nonce: v.nonceHex, timestampMs: v.timestampMs,
  };
  const atts = [{ signer: v.signerAddress, signature: v.signatureHex }];

  // 5. Outcome on chain
  await (await core.verifyAndRecordOutcomeDev(workflowId, payload, atts, 12)).wait();
  console.log("[outcome] recorded");

  // 6. Wait dispute window
  process.stdout.write("[dispute] waiting");
  while (!(await core.disputeWindowClosed(workflowId))) { process.stdout.write("."); await new Promise(r => setTimeout(r, 2000)); }
  console.log(" closed");

  // 7. Settle
  rc = await (await core.settleWorkflowDev(workflowId, payload, atts)).wait();
  console.log("[settle] tx:", rc.hash);
  console.log("customer USDC after:", ethers.formatUnits(await usdc.balanceOf(customer.address), 6));
  console.log("\n✓ Agent run → verify → settle succeeded end to end on Fuji");
}

main().catch((e) => { console.error(e); process.exit(1); });
