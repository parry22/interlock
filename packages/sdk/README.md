# @interlock/sdk

TypeScript SDK for **Interlock** — get paid for AI outcomes, not tokens, with settlement on Avalanche.

> **Status: 0.2.0 (preview)**
>
> The `InterlockClient` HTTP client below is real and works today against a running Interlock server. The lower-level on-chain `Interlock` class (direct contract calls) is still a preview surface.

## What Interlock does

Interlock lets you charge for AI work based on **whether it succeeded**, not how many tokens it used:

1. You commit a price and machine-checkable success criteria up front — locked on Avalanche.
2. The customer's USDC is held in escrow.
3. Your agent runs and reports its costs.
4. A verifier checks the result against the criteria and signs a verdict.
5. If it passed, the escrow pays everyone at once — your company, the model providers, tool APIs, and the platform fee — in a single transaction.
6. If it failed, the customer is refunded in full.

The contract enforces the bounds (registered recipients only, payouts ≤ escrow, fee ≤ cap, no paying yourself) so even a compromised verifier can't drain funds.

## Install

```bash
npm i @interlock/sdk
```

No blockchain library required — the client talks to your Interlock server over HTTP.

## Usage

```ts
import { InterlockClient } from "@interlock/sdk";

const wos = new InterlockClient({
  apiKey: process.env.INTERLOCK_API_KEY!,   // wos_… minted at /developer
  baseUrl: "https://your-interlock-host",   // your deployment
});

// Runs the full lifecycle and streams stage events back as they happen.
for await (const ev of wos.workflows.start({
  priceBaseUnits: 10_000_000,             // 10 USDC (6 decimals)
  criteria: {
    type: "all_of",
    criteria: [
      { type: "exact",             path: "/ticket_status", value: "closed" },
      { type: "numeric_threshold", path: "/refund_amount", op: "<=", value: 100 },
    ],
  },
  outcome: { ticket_status: "closed", refund_amount: 47.5 },
  costItems: [
    { provider: "0x…model", category: 0, units: 12000, amount: 2_000_000 },
    { provider: "0x…tool",  category: 1, units: 3,     amount: 500_000 },
  ],
})) {
  if (ev.event === "stage") console.log(ev.data.stage, ev.data.status);
  if (ev.event === "complete") console.log("workflow", ev.data.workflowId);
}
```

## Success criteria DSL

A tagged union over [RFC 6901 JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) paths into the outcome record:

```ts
type SuccessCriterion =
  | { type: "exact";             path: string; value: any }
  | { type: "regex";             path: string; pattern: string; flags?: string }
  | { type: "json_schema";       schema: JSONSchema }
  | { type: "numeric_threshold"; path: string; op: "<"|"<="|">"|">="|"=="|"!="; value: number }
  | { type: "semantic_match";    path: string; expected: string; threshold: number }
  | { type: "all_of";            criteria: SuccessCriterion[] }
  | { type: "any_of";            criteria: SuccessCriterion[] }
  | { type: "not";               criterion: SuccessCriterion };
```

Deterministic predicates (exact, regex, json_schema, numeric_threshold, and Boolean composition) are live today. `semantic_match` (multi-LLM voting) is on the roadmap.

## What the verifier guarantees

- Your success criteria are **hash-bound to the on-chain quote** — they can't be swapped after the price is agreed.
- The price and platform fee are read **from the chain**, not from the request.
- Every verdict is backed by a **public, replayable proof blob** on Walrus.

Known limitation during early access: reported costs are taken from the agent's own SDK. Independent provider-invoice reconciliation is on the roadmap.

## Defense in depth

| Concern | Mitigation |
|---|---|
| Verifier signs bogus splits | Contract rejects unregistered recipients, payouts > escrow, fee > cap |
| Replay of a stale verdict | Nonce + workflow-id binding + status check |
| Customer underreports costs | Provider-invoice reconciliation (roadmap) |
| Disputed workflow stuck forever | Admin arbitration: refund the customer or dismiss the dispute |

## License

MIT
