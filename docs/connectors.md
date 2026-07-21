# Connector framework

Independently confirms a claimed outcome actually happened in the customer's
downstream system of record (field-service platform, ATS, HRIS) before Interlock
finalizes a billing event. One `Connector` interface, N providers, zero core
edits to add the N+1th.

## How it fits together

```
provider  ──webhook──▶  /api/connectors/[system]/webhook?c=<connId>
          ──poll─────▶  /api/connectors/poll-tick (cron)
                               │
                    verify signature (per provider)
                               │
                        land (inbound_events)         ← dedupe on (connection, sourceEventId)
                               │
                        normalize() → CanonicalOutcomeEvent[]
                               │
                        upsert (outcome_events)        ← dedupe on (connectorId, sourceEventId)
                               │
                 apply reversal / confirmation rules (generic)
                               │
      provisional ──(reversal window elapses, no reversal)──▶ finalized ──emit──▶ webhook_deliveries
                  ──(termination / refund / dispute in window)─▶ reversed
```

- **Runtime**: Postgres + Vercel Cron state machines (no queue lib), matching the
  existing `webhook_deliveries` / keeper pattern.
- **Credentials**: AES-256-GCM at rest via `src/lib/db/encryption.ts`
  (`SETTINGS_ENCRYPTION_KEY`). No plaintext tokens.
- **Tenancy**: `customerId` = `customers.address`.
- **Billing hookup (this pass)**: a finalized `OutcomeEvent` is emitted through
  the existing outbound webhook pipeline (`outcome.finalized` / `outcome.reversed`).
  Wiring to on-chain settlement is a deliberate follow-up.

## Files

| Path | Role |
|---|---|
| `src/lib/connectors/types.ts` | `Connector` interface + `CanonicalOutcomeEvent` |
| `src/lib/connectors/registry.ts` | slug → connector (add a provider here) |
| `src/lib/connectors/ingest.ts` | shared land → normalize → store → rules |
| `src/lib/connectors/reversal.ts` | generic reversal/confirmation engine |
| `src/lib/connectors/emit.ts` | emit finalized/reversed via `webhook_deliveries` |
| `src/lib/connectors/providers/*.ts` | the six connectors |
| `src/lib/db/connectors.ts` | data access (dedupe, retry, reversal queries) |
| `src/app/api/connectors/*` | webhook intake, connect, health, 3 cron drains |

## Webhook vs. polled, per provider

| Provider | Vertical | Transport | Events | Why |
|---|---|---|---|---|
| **ServiceTitan** | field service | **Polled** | job.booked, job.completed, invoice.paid/refunded | Public webhook coverage is thin/portal-gated; the reliable signal is polling the JPM (Jobs) + Accounting (Invoices) APIs by `modifiedOnOrAfter`. |
| **Housecall Pro** | field service | **Webhook** (poll fallback) | job.booked, job.completed, invoice.paid/refunded | Real job/invoice webhooks. Polling `/jobs?sort_by=updated_at` backstops accounts without webhooks. |
| **Greenhouse** | recruiting ATS | **Webhook** | candidate.stage_change, offer.accepted, hire.started | "Web Hooks" cover stage changes + `candidate_hired`. |
| **Lever** | recruiting ATS | **Webhook** | candidate.stage_change, offer.accepted, hire.started | Native webhooks for `candidateStageChange` / `candidateHired`. |
| **BambooHR** | recruiting HRIS | **Webhook** (poll fallback) | employment.terminated | Field-change webhook on status/terminationDate. `/employees/changed` polling backstop. **This is the retention-reversal source.** |
| **mock** | generic | Webhook | any (payload carries canonical type) | Local dev + CI, no external calls. |

## Reversal / gaming protection

Generic engine (`reversal.ts`), driven by three small sets — **no vertical-specific
branches**:

- **Billable** (`job.completed`, `hire.started`): carry a provisional→finalized
  lifecycle with a `reversalWindowExpiresAt`.
- **Reversing** (`employment.terminated`, `invoice.refunded`, `job.disputed`):
  void a still-provisional billable for the same `(customerId, entityId)` if they
  land within the window.
- **Confirming** (`invoice.paid` → `job.completed`): finalize a provisional
  billable **early**.

Windows (customer-configurable per connection via `config`):
- Recruiting: `retentionDays` (default **90**). A hire finalizes only after the
  window elapses with no termination.
- Field service: finalized early by `invoice.paid`, else after `gracePeriodDays`
  (default **7**) with no refund/dispute.

The `reversal-tick` cron finalizes/reverses due events; the ingest path also
handles reversals arriving early and **out-of-order** (a termination that lands
before the hire) via the same `selectReverser` predicate.

### Cross-connector matching (important)

A hire comes from the **ATS** (Greenhouse/Lever) but the termination that reverses
it comes from the **HRIS** (BambooHR) — different `sourceSystem`s. The engine matches
on `(customerId, entityId)` **across** source systems, with `entityId` normalized to
a shared key:

- **People** (recruiting): `entityId` = **work email, lowercased**. Greenhouse/Lever
  set it from the candidate email; BambooHR from `workEmail`.
- **Jobs** (field service): `entityId` = **job id**. Invoice events set `entityId` to
  the *job* id (not the invoice id) so they match the completed job.

## Idempotency, retry, rate limits

- **Idempotency**: deduped twice on the provider's event id — at landing
  (`inbound_events` unique `(connection, sourceEventId)`) and at the canonical
  layer (`outcome_events` unique `(connectorId, sourceEventId)`). Replays/double
  delivery are no-ops.
- **Retry**: processing failures set `inbound_events.status = failed_retryable`
  with exponential backoff (`30s × 2^attempts`, cap 5) drained by `ingest-tick`.
  Nothing is silently dropped; exhausted rows land in `failed` with `last_error`.
- **Rate limits**: each connector declares `capabilities.rateLimit` from the
  provider's documented limit (e.g. Greenhouse 50/10s, Lever 10/s). Poll batch
  sizes are bounded; providers return `429 + Retry-After` on breach.

## Provider quirks a future integrator should know

- **ServiceTitan**: two hostnames per env (`auth-integration` vs `api-integration`,
  drop `-integration` for prod); every API call needs `ST-App-Key` + `tenant` id;
  OAuth is client-credentials. Poll cursor uses `modifiedOnOrAfter`; re-polling an
  unchanged record dedupes because `sourceEventId` embeds `modifiedOn`.
- **Housecall Pro**: API keys are a Max-plan feature; webhook signing is opt-in —
  unsigned deliveries are accepted but stamped lower `confidence` (0.9).
- **Greenhouse**: signature header is `Signature: sha256 <hexdigest>` (note the
  `sha256 ` prefix). No termination events — retention reversal is cross-connector
  via BambooHR. Harvest API is HTTP Basic (`apiKey:` base64).
- **Lever**: signature is HMAC over `token + triggeredAt` (both in the payload),
  **not** the raw body — a real gotcha. Webhooks carry stage *IDs*, not names, so
  `offer.accepted` is only detected when `config.offerStageId` is set. Email may be
  absent from the webhook (falls back to `leverid:<id>`, which won't cross-match a
  BambooHR termination — enrich via the Data API if you need it).
- **BambooHR**: the webhook only includes fields you configure it to monitor — you
  **must** monitor `workEmail` + `status` + `terminationDate`, or the email join
  (and thus reversal) can't happen. Signature is HMAC-SHA256 in `x-bamboohr-signature`
  when a private key is set. Subdomain-scoped; Basic auth is `apiKey:x` base64.

## Adding a connector (no core edits)

1. `src/lib/connectors/providers/<name>.ts` implementing `Connector`.
2. Add it to the array in `registry.ts`.
That's it — webhook intake, polling, retry, and reversal all route by slug.
The interface already accommodates Salesforce/HubSpot/legal/healthcare.

## Sandbox / credentials

All five providers have sandbox/test environments. This pass was built against
each provider's documented API/webhook/signature shapes and is covered by unit
tests over recorded-shape fixtures + the mock connector (no external creds needed
for CI). To smoke-test against real sandboxes, add credentials and connect:

```
POST /api/connectors/connect
{ "sourceSystem": "greenhouse", "params": { "apiKey": "<sandbox key>" },
  "webhookSecret": "<signing secret>", "config": { "retentionDays": 90 } }
```

The response returns the `webhookUrl` (`/api/connectors/<system>/webhook?c=<id>`)
to register with the provider. `SETTINGS_ENCRYPTION_KEY` must be set (creds are
encrypted at rest). Provider env conventions:
- ServiceTitan: `params` = `{ clientId, clientSecret, appKey, tenantId, env: "integration" }`
- Housecall Pro: `params` = `{ apiKey }`
- Greenhouse: `params` = `{ apiKey }` (Harvest)
- Lever: `params` = `{ apiKey, env: "sandbox" }`
- BambooHR: `params` = `{ apiKey, subdomain }`

## Cron schedule (vercel.json)

| Route | Schedule | Purpose |
|---|---|---|
| `/api/connectors/poll-tick` | `*/15 * * * *` | polling fallback |
| `/api/connectors/ingest-tick` | `*/5 * * * *` | retry drain |
| `/api/connectors/reversal-tick` | `0 * * * *` | finalize/reverse due events |
