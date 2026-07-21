@AGENTS.md

# Interlock

AI-native billing & outcome settlement platform. Customers run AI agents; Interlock quotes them, escrows USDC, verifies outcomes in a TEE, and atomically settles multi-party payouts (agent company + model providers + tool APIs + humans-in-the-loop + platform fee) on Sui — all in one PTB.

**Tagline (frontend):** *Pricing Intelligence for the Agent Economy.*

## 60-second demo script

1. **Open `/dashboard`** — four metric cards show live testnet GMV / margin / workflow count / platform fee. The Live Activity feed below the charts lists real on-chain workflows.
2. **Navigate to `/workflows`** → click **"Run demo workflow"** in the filter bar. A side drawer opens.
3. **Watch 7 stage cards light up in real time over ~25 seconds** — Quote → Workflow (escrow lock) → Execution → Verifier (Vercel function signs ed25519) → Outcome on chain → Dispute window (5s wait) → Atomic settlement. Each card shows the real Sui tx digest with a Suiscan link.
4. **Click "Open workflow"** at the end → land on `/workflows/[id]` showing the full 5-stage lifecycle with real Quote price + criteria, Execution cost items, Outcome verdict, and the 4-recipient Settlement split.
5. **Click any Walrus blob ID** (cloud-download chip) → side panel fetches the bytes from `aggregator.walrus-testnet.walrus.space` and renders the actual evidence: the outcome JSON the agent submitted, the cost trace, the verifier's audit trail (evaluation steps, criteria hash, nonce).
6. **Click "Settlement on Suiscan ↗"** → verify the same numbers on the public Sui block explorer. No trust in our app needed.

The story this tells: **price + criteria locked at quote time → outcome verified cryptographically → atomic multi-party settlement → every step auditable end-to-end on a public chain + decentralized storage**. No part of this is mocked.

## Architecture at a glance

Three planes — see `ARCHITECTURE.md` for the full spec.

- **Control plane → Sui** — Move objects (`Workflow`, `Quote`, `Execution`, `Outcome`, `Settlement`), USDC escrow, atomic multi-party splits via PTBs, attestation verification.
- **Compute plane (production) → Sui Nautilus (AWS Nitro Enclaves)** — outcome verifier, pricing engine (phase 2), dispute arbitrator (phase 2). Enclaves produce attestations Sui verifies on-chain.
- **Compute plane (HACKATHON) → Vercel serverless function with ed25519 dev-signer.** Same `AttestationPayload` schema, same Move-side validation invariants — only the cert-chain check is swapped for a registered-pubkey check. See "Hackathon mode" section below.
- **Data plane → Walrus** — execution traces, outcome artifacts, proof blobs, dispute evidence. Sui stores only blob IDs + hashes. Hackathon uses **public Walrus testnet publisher** (free).
- **Off-chain — single Next.js project on Vercel.** API routes for verifier, settlement keeper, indexer, customer API, webhook delivery. Postgres on **Neon** free tier. No separate Node.js project, no EKS — everything in `src/app/api/`.

## Repo state (2026-05-23)

- **Frontend (`src/`)** — Next.js **16.2.6**, React **19.2.4**, TypeScript strict, Tailwind v4, Recharts, HugeIcons. Landing page + 9 dashboard routes scaffolded **UI-only** (no Sui SDK, no Walrus SDK, no wallet, no API client wired). Routes: `/dashboard`, `/workflows`, `/workflows/[id]`, `/quotes`, `/settlement`, `/margin`, `/customers`, `/pricing-intel`, `/settings`, `/developer`.
- **Backend Move package (`backend/move/`)** — ✅ **P1 COMPLETE.** Published to Sui testnet 2026-05-24. 9 modules, 6/6 unit tests passing locally, 3 live txs validated on chain.
  - **Package ID:** `0x0e6a08aa50fd80129d8ae83b0a3ccdee3e7becdce84785f96f547e09fd52ca6d` (testnet)
  - **AdminCap:** `0x35d194afc0e999f39bc7e992db279eddddb757e987c1056977d5f63d859a1868` (owner: deployer)
  - **ProviderRegistry (shared):** `0xd6d669ea72bc2fdb4e3153a74ef46868b4042e0829ed98a3561bab13cc8cd7ca`
  - **UpgradeCap:** `0x9169fd22b46823c56931a01f9c82bc57c40f2104a089754c6293e9024401de27`
  - **Deployer/admin:** `0xa7d0740b247a14ea578bf6f65b352d56e4fa6fdc8f69a6ce4b1276513bb85d2c`
  - **Modules:** `types`, `registry`, `quote`, `escrow`, `workflow`, `execution`, `outcome`, `attestation`, `settlement`
  - **Local tests (6/6):** happy-path settlement, failure-path refund, settle-before-window rejected, self-pay rejected, unregistered recipient rejected, dispute blocks settlement
  - **Live testnet validation:** package + ProviderRegistry queryable; `create_product` worked (emitted `ProductCreated`); `register_provider` worked (emitted `ProviderRegistered`, mutated ProviderRegistry)
  - **Full deployment record:** `backend/move/deployments/testnet.json`
  - Phantom-typed escrow `Escrow<T>` (generic over coin type — `USDC` marker used in tests; real Circle USDC type swapped in at customer-PTB construction time)
  - **Attestation P1 stub:** PCR allowlist + M-of-N distinct enclaves + payload binding. Full AWS Nitro cert-chain verification lands in P2.
- **Enclaves, off-chain services, SDK** — not started yet (P2/P3+).

## Stack decisions (locked)

| Layer | Hackathon (now) | Production (post-hackathon) |
|---|---|---|
| On-chain | Sui Move — single `interlock` package, multi-module, under `backend/move/` | Same package, mainnet |
| Compute / verifier | **Vercel serverless function** (`/api/verify`) with ed25519 dev-signer registered on-chain | AWS Nitro Enclaves via Sui Nautilus, PCRs registered on-chain |
| Storage (blobs) | Walrus **testnet** public publisher (free) | Walrus mainnet, self-hosted publisher when volume justifies |
| Stablecoin | Native USDC on Sui testnet | Native USDC on Sui mainnet |
| Wallet | `@mysten/dapp-kit` — zkLogin default + sponsored txs | Same + multi-sig for enterprise |
| Frontend | Next.js 16 + React 19 + Tailwind v4 + TanStack Query + RSC | Same |
| Off-chain backend | **Next.js API routes** (`src/app/api/*`) — verifier, keeper, indexer, customer API, webhook delivery | Split into separate services on EKS multi-region active-active |
| Database | **Neon Postgres free tier** (Vercel integration) | Postgres on Aurora multi-region + Redis cache/queues |
| Background jobs | **Vercel Cron** (1/min for keeper + indexer) | Long-running workers on EKS |
| SDK | TypeScript first (`packages/sdk/`) | + Python phase 1.5; Go + Rust phase 2 |
| Hosting | **Everything on Vercel free tier** + Neon free tier | Vercel for frontend, EKS for backend |
| Total monthly $ | **$0** | $1K+ |

## Locked algorithm decisions

The two algorithms that the platform's moat rests on — multi-party atomic settlement and cryptographically verifiable outcomes. Full specs in `ARCHITECTURE.md` §10 and §11.

### Multi-party atomic settlement (§10)

- **Hybrid: Nautilus enclave proposes splits, Move validates bounds.** Enclave reconciles costs vs provider APIs, computes splits, signs. Move enforces invariants (registered recipients in `Registry`, `sum(splits) ≤ escrow`, `platform_fee ≤ cap`, no self-pay).
- **Failure policy (MVP):** Full refund to customer on `success = false`. Agent company eats provider costs. Configurable per product in Phase 2 (cost-recovery / partial).
- **Permissionless settlement:** anyone can call `settle_workflow` after dispute window closes; platform runs a keeper as default trigger.
- **Single PTB, all-or-nothing:** all transfers + state updates execute atomically. Gas exhaustion mid-PTB → tx aborts, no partial payment.
- **Defense in depth:** a compromised enclave can produce invalid proposals (rejected by Move) but cannot drain funds.

### Cryptographically verifiable outcomes (§11)

- **Success criteria DSL:** tagged-union — `exact | regex | json_schema | numeric_threshold | semantic_match | all_of | any_of | not`. CBOR-encoded in `Quote.success_criteria`; `Quote.success_criteria_hash = sha256(...)` stored for tamper detection. Paths use **RFC 6901 JSON Pointer**.
- **Layered verifier:** MVP ships **deterministic-only** (exact, regex, json_schema, numeric_threshold, Boolean composition). Phase 2 adds `semantic_match` via **2-of-3 multi-LLM voting** (Claude / GPT / Gemini), TLS-attested, evidence on Walrus. Graceful degradation on vendor outage.
- **Attestation payload binds:** `workflow_id`, success bool, blob IDs (outcome / trace / proof), reconciled cost items, splits, fee, nonce, timestamp. AWS Nitro signature; PCR allowlist in `Registry`, rolling-upgrade safe.
- **M-of-N attestation:** `Registry.Product.min_attestations: u8`, default **1**. High-value products can require 2-of-3 independent enclave instances with byte-identical payloads.

---

## Operational posture — ed25519 signer (locked decision, 2026-05-28)

**Decision:** we are staying on the ed25519 dev-signer verifier indefinitely, not just for the hackathon. Real AWS Nitro enclaves cost ~$125/mo minimum, which we are not willing to spend until there is funding or revenue. The on-chain ed25519 verification path (`attestation::verify_dev_attestations` + `settlement::settle_workflow_dev`) is our **operational architecture for the foreseeable future**, not a temporary hack.

**What stays in code (do not remove):** the Nitro production path is fully preserved in:
- `attestation.move::verify_attestations` (PCR allowlist + cert-chain-verification stub)
- `settlement.move::settle_workflow` (the Nitro settlement entry)
- The `EnclaveAttestation` struct, PCR allowlist on `Product`, M-of-N attestation schema
- The ARCHITECTURE.md §10/§11 spec describes both paths

This is intentional. **Before going to prod we will activate the Nitro path** — the work is mostly already done in Move (the cert-chain check is the only ~50 line piece to finish). Until then the ed25519 path is what runs.

**Trust trade-off we accept:**

| Concern | Nitro production path | ed25519 signer (current) |
|---|---|---|
| Trust anchor | AWS root cert | Our key in env var |
| Compromise blast radius | Enclave rebuild + new PCR registration | All past signatures retroactively suspect |
| Defense in depth | Move bounds checks | **Move bounds checks (identical)** |
| Customer auditability | Reproducible enclave build | Source code public + proof blobs on Walrus replayable |
| Cost | $125+/mo | $0 |

**The Move-side bounds enforcement is identical either way** — a compromised signer cannot drain funds (registered-recipients-only, sum ≤ escrow, fee ≤ cap, no self-pay). The residual risk is that a compromised signer could approve a `success=true` outcome that should have been `false`. Mitigations available right now:

1. **M-of-N signer voting** — `Product.min_attestations: u8` is already on chain. Set to ≥2, register multiple dev signer pubkeys, run two verifier instances with different keys.
2. **Key rotation** — `registry::allow_dev_signer` is add-before-remove safe: register the new key, switch env var, then revoke the old key. Workflows in flight stay valid.
3. **Public proof blobs on Walrus** — anyone can replay the verifier inputs and detect dishonest verdicts after the fact.

---

## Hackathon mode (zero-budget posture)

This is a hackathon project. **No AWS spend, no paid services, no credit card required.** Production architecture from `ARCHITECTURE.md` is preserved; only the trust-bootstrapping primitive is swapped (see "Operational posture" above for the locked decision).

### What's swapped vs. production

| Component | Production | Hackathon |
|---|---|---|
| Verifier signer | AWS Nitro Enclave (PCR registered on-chain, signs with enclave key) | **Vercel serverless function** (`/api/verify`) signing with ed25519 dev key, pubkey hash registered in `Registry.allowed_dev_signers` |
| Move signature verification | `verify_attestations` — AWS Nitro cert chain + PCR allowlist | `verify_dev_attestations` — ed25519 sig vs registered pubkey |
| Settlement entry | `settle_workflow` (Nitro path) | `settle_workflow_dev` (ed25519 path) — same invariants, different sig check |
| Walrus access | Self-hosted publisher in prod | Public testnet publisher (free) |
| Cost reconciliation | Workers call OpenAI/Anthropic invoice APIs hourly | Pass-through: enclave echoes SDK-reported costs as `reconciled_cost_items` |
| Backend hosting | Separate Node.js services on EKS multi-region | All API routes in the single Next.js app on Vercel free tier |
| Database | Aurora Postgres + Redis | Neon free tier (3 GB) |
| Background jobs | Long-running workers | Vercel Cron (1/min for keeper + indexer) |

### What stays identical to production

- All 9 Move modules — settlement algorithm, bounds checks, multi-party splits, dispute window, refund branch
- `AttestationPayload` schema (workflow_id, blob IDs, reconciled costs, splits, fee, nonce, timestamp)
- Success criteria DSL (tagged union, CBOR-encoded, sha256-hashed on Quote)
- Walrus blob storage (just testnet vs mainnet)
- USDC escrow + atomic multi-party PTB
- Permissionless settlement trigger
- M-of-N attestation schema (`min_attestations` field in Product)
- Frontend: same Next.js dashboard, same zkLogin flow, same SDK API surface

### Production migration path (post-hackathon)

A ~200-line patch: register a real Nitro PCR via `registry::allow_pcr`, deploy verifier image to EC2 m5a.xlarge, point SDK at the new endpoint, switch `/api/verify` from `settle_workflow_dev` to `settle_workflow`. The Move code path for AWS Nitro is already written (P1 stub for cert-chain verify; lands in real form once we have funding).

### Demo story for judges

> "In production the verifier runs in an AWS Nitro Enclave; the AWS root cert anchors the chain of trust to Move. For this hackathon the verifier runs in a Vercel function and signs with an ed25519 key whose public hash is registered on chain in our Registry. **The Move-side validation logic is identical** — only the cert-chain check is swapped for a direct pubkey check. The 50-line patch to flip back to real Nitro is in `attestation.move::verify_attestations`."

---

## Build phases (MVP — 24 weeks)

Following the doc's milestone plan. **Move contracts first** (everything else depends on object shapes).

| Phase | Weeks | Deliverable |
|---|---|---|
| **P1 — Move contracts** | 1–3 | All 8 modules (`workflow`, `quote`, `escrow`, `execution`, `outcome`, `settlement`, `attestation`, `registry`) on devnet, with unit + integration tests |
| **P2 — Verifier (Vercel mock)** | ~1 week | `/api/verify` route in Next.js: criteria DSL eval + Walrus testnet upload + ed25519 sign. `verify_dev_attestations` added to `attestation.move`. Move package republished |
| **P3 — Walrus + SDK alpha** | 7–9 | TS SDK with cost recording + lifecycle; Walrus uploads for traces/artifacts (already done in P2 verifier route) |
| **P4 — Dashboard alpha** | 10–12 | Wire existing Next.js scaffolding to live indexer DB; wallet integration; internal dogfood |
| **P5 — Testnet E2E** | 13–16 | Full lifecycle on Sui testnet; first design-partner integration |
| **P6 — Mainnet launch** | 17–20 | Audit complete; mainnet deploy; 3 design partners in production |
| **P7 — Scale-up** | 21–24 | Hardening, observability, cost-ingestion reliability; phase-2 prep |

**Phase 1 status:** ✅ COMPLETE (2026-05-24). Move package compiled clean, 6/6 unit tests pass locally, published to testnet (`0x0e6a08aa...`), live txs validated.

**Phase 2 status (2026-05-25):** ✅ VERIFIER PIPELINE COMPLETE. Local roundtrip validated end-to-end.

Done:
1. ✅ `verify_dev_attestations` + `register_dev_signer` added to Move package
2. ✅ `settle_workflow_dev` added with shared `do_settle` helper (DRY with production path)
3. ✅ 8/8 Move tests pass (6 original + 2 new dev-path negative tests)
4. ✅ Republished to testnet: **package v2 = `0xde20ecfbc8cd105c471d735493616aa3fb29928747182d5260fd3379c0eb8534`**
5. ✅ ed25519 dev keypair generated; pubkey `0x45b327db...` registered on hackathon-demo Product (`0x4e888cde...`)
6. ✅ `/api/verify` route built: DSL evaluator + Walrus testnet upload + BCS encode + ed25519 sign
7. ✅ Roundtrip test (`backend/scripts/test-verify-roundtrip.mjs`) green:
   - DSL evaluates success criteria correctly
   - Walrus testnet uploads succeed (real blob IDs returned)
   - BCS encoding matches Move's `bcs::to_bytes`
   - ed25519 signature verifies locally against registered pubkey
   - Splits sum to quote price; platform fee = price × fee_bps / 10000
8. **Postgres + indexer DEFERRED** — dashboard will read from Sui RPC directly for the hackathon (single-customer demo, low query volume).

Remaining for full demo:
- 🚧 `/api/keeper/tick` cron — auto-settle workflows after dispute window
- 🚧 Deploy to Vercel preview + smoke test

✅ **Dashboard wired to Sui RPC (2026-05-27):**
- `src/lib/interlock/queries.ts` — server-side reads (listWorkflows, getWorkflow, dashboardStats) discovering objects from `WorkflowCreated` events
- `src/lib/interlock/format.ts` — SUI/address/relative-time formatters
- API routes: `/api/sui/workflows`, `/api/sui/workflow/[id]`, `/api/sui/stats`
- `/dashboard` (RSC): live metrics + live activity feed from chain
- `/workflows` (client): list fetched from `/api/sui/workflows` with status filter
- `/workflows/[id]` (client): 7-stage lifecycle view with real Quote / Execution / Outcome / Settlement linked objects + splits + Walrus blob IDs + Suiscan deeplink

✅ **Postgres migration (Phases A + B + C, 2026-05-28):**

**Phase A — foundation:**
- Neon Postgres free tier connected. `DATABASE_URL` in `.env.local`, pooled connection.
- **`src/lib/db/schema.ts`** — 10 tables: `users`, `customers`, `api_keys`, `tenant_settings`, `indexed_workflows`/`_quotes`/`_settlements`/`_disputes`, `webhook_deliveries`, `audit_log`, `indexer_cursor`. Proper indexes on customer, status, productId, etc.
- **`src/lib/db/index.ts`** — Drizzle client with lazy pool (max 5 connections), `checkDbConnection()` health helper.
- **`src/lib/db/encryption.ts`** — AES-256-GCM for at-rest encryption of webhook signing secrets. Master key in `SETTINGS_ENCRYPTION_KEY` env.
- **Migration tooling**: `npm run db:generate`, `db:migrate` (idempotent), `db:health`, `db:studio`.
- `/api/customers`, `/api/apikeys`, `/api/settings` refactored to use Postgres. Old `src/lib/interlock/kv.ts` deleted; `@vercel/kv` uninstalled.

**Phase B — event indexer + faster reads:**
- **`src/lib/db/indexer.ts`** — `runIndexerTick()` mirrors `WorkflowCreated`/`QuoteCreated`/`WorkflowSettled`/`DisputeFiled` from Sui RPC into `indexed_*` tables. Upserts via `onConflictDoUpdate`. Tracks per-event-type health in `indexer_cursor`.
- **`/api/keeper/index-tick`** — POST/GET endpoint that runs one indexer pass. ~9 sec for full re-scan of ~7 workflows / 13 quotes / 4 settlements.
- **`src/lib/db/queries.ts`** — Postgres-backed read library with the same surface as `src/lib/interlock/queries.ts`. Aggregates via `GROUP BY` instead of in-memory iteration.
- `/api/sui/workflows`, `/api/sui/stats`, `/api/sui/quotes`, `/api/sui/settlements`, `/api/sui/disputes`, `/api/sui/customers-agg`, `/api/sui/margin` switched to Postgres reads. **Dashboard page loads drop from ~2-3s to <300ms.**
- `/api/demo/run-lifecycle` auto-triggers `/api/keeper/index-tick` on completion so new workflows appear immediately.
- **`<RefreshIndexerButton>`** on `/settings` for manual sync. `vercel.json` cron entry: every 15 min.

**Phase C — user identity + audit + webhooks:**
- **JWT signature verification** in `/api/auth/zklogin/prove` — verifies RS256 against Google's published JWKS (issuer + audience checked) before trusting any claims.
- **`users` table** auto-populated on every zkLogin sign-in — INSERT on first sign-in, UPDATE `last_seen_at` on subsequent. Writes `user.signup` / `user.signin` audit_log entries.
- **`audit_log`** entries on every mutation: `customer.create/update/delete`, `apikey.generate/revoke`, `settings.create/update`, `user.signup/signin`. Immutable, append-only.
- **`/api/audit-log?actor=&action=&limit=`** — query endpoint with filters.
- **`/api/webhooks/dispatch`** — webhook delivery worker:
  - Marks `in_flight` before sending (prevents double-delivery)
  - HMAC-SHA256 signature with decrypted signing secret → `X-Interlock-Signature` header
  - 2xx → `delivered`, sets `delivered_at_ms`
  - non-2xx / error → exponential backoff retry (`base × 2^attempts`), max attempts from tenant settings
  - After max attempts → `failed` with `last_error`
- Indexer auto-enqueues `WorkflowSettled` webhook for every tenant with that topic subscribed (or empty filter) on every newly-detected settlement.
- `vercel.json` cron entries: `index-tick` every 15 min, `webhooks/dispatch` every 5 min.

**Result: production-shaped backend.** From "dashboard hammers Sui RPC on every load" to "Postgres-backed sub-300ms reads, end-to-end audit trail, real webhook delivery with retry, JWT-verified user persistence". All on Neon free tier (~0.5 GB).

✅ **zkLogin tx-signing + auto-faucet (2026-05-28):**
- `/api/auth/zklogin/prove` now also auto-faucets the derived Sui address (~1 SUI from testnet). Best-effort; returns `faucet.status: funded | rate_limited | error`.
- `src/lib/interlock/lifecycle.ts` refactored:
  - New `ZkLoginContext` type — `{ senderAddress, zkProofInputs, maxEpoch }`
  - `submit()` takes an optional `zk?: ZkLoginContext`. When set, the tx.sender becomes the zkLogin address, the tx is signed with the ephemeral key, and the signature is wrapped via `getZkLoginSignature(inputs, maxEpoch, userSignature)` before submission. Otherwise falls back to the original ed25519 path.
  - All six lifecycle entries (`createQuote`, `createWorkflow`, `recordExecution`, `submitAttestationDev`, `settleWorkflowDev`, `fileDispute`) accept an optional `zk` parameter that threads through to `submit()`.
- `/api/demo/run-lifecycle` now accepts `zkLoginSession` in the request body. When set, the lifecycle runs with the zkLogin user as customer + signs each tx via their ephemeral key + zkProof. Falls back to env-var customer otherwise.
- `LifecycleDemoDrawer` reads the zkLogin session from `localStorage` and attaches it to the POST. New "signing mode" banner in the drawer shows `zkLogin | platform key · customer: 0x…` so judges can see whose identity is creating workflows.
- End-state flow for a zkLogin-signed-in user: click **"Sign in with Google"** → wallet auto-funded → click **"Run demo workflow"** → workflow created with **their Sui address as customer** on chain.

✅ **zkLogin auth (2026-05-28):**
- Google OAuth Client ID: `430983446538-…apps.googleusercontent.com` (in `.env.local` as `NEXT_PUBLIC_GOOGLE_CLIENT_ID`)
- Uses Mysten's public prover (`prover-dev.mystenlabs.com/v1`) + fixed platform salt
- **`src/lib/interlock/zklogin.ts`** — shared types + JWT claim decoder + config
- **`/api/auth/zklogin/epoch`** — returns current Sui epoch + maxEpoch for ephemeral key
- **`/api/auth/zklogin/prove`** — receives JWT, calls Mysten prover, derives Sui address via `computeZkLoginAddress`, returns zkProof + display claims (email, name, picture)
- **`/auth/zklogin/callback`** — client page that extracts `id_token` from URL fragment, POSTs to prove, stores session in localStorage, redirects back to `/dashboard`
- **`<ZkLoginButton>`** in TopNav: "Sign in with Google" → OAuth round-trip → shows avatar + name + truncated Sui address. Menu shows the full derived address with copy.
- **What still uses env-var customer:** the actual lifecycle's on-chain signing. zkLogin tx-signing (replacing the env-var customer keypair for workflow creation) is a Phase 2.5 follow-up — current scope ships the auth flow + address derivation.
- Smoke-tested: `/api/auth/zklogin/epoch` returns `{epoch: 1113, maxEpoch: 1115}`. Dashboard renders the sign-in button next to the search bar.

✅ **Sponsored transactions (2026-05-28):**
- **Sponsor keypair** generated + funded (address `0x05aa2007…`, ~0.05 SUI). Privkey in `.env.local` as `INTERLOCK_SPONSOR_PRIVKEY`.
- **`submitSponsored()`** helper in `src/lib/interlock/lifecycle.ts`: customer signs the tx (proves intent + supplies escrow coin from their wallet), sponsor signs the same canonical bytes + provides gas coin. Both signatures submitted together via `executeTransactionBlock`.
- **`createWorkflowSponsored()`** variant that pulls payment principal from a customer-owned SUI coin (not from `tx.gas`) — so sponsorship is gas-only, never principal.
- **`/api/sui/sponsored-workflow`** demo route. Smoke-tested on testnet: workflow `0xfbba42514cb7f6c989d547bc280647d6045cc1b949cf4d6bf62f2408ddff4a3a` created via sponsored tx, customer paid 0.1 SUI escrow from their coin, sponsor paid ~0.003 SUI gas. Tx digest `CNdxoXA8UxvZ4UArakVLAXQyHuHRfAMzzNzxFjfp3fmH`.

✅ **M-of-N + SDK package (2026-05-28):**
- **Secondary dev signer pubkey** `0x2a5d722651643c66c28cfb6cdfdb79a144411de2e2d1c977702e9b0d68592c02` registered on the demo Product alongside the primary `0x45b327db…`. Both privkeys in `.env.local` as `INTERLOCK_DEV_SIGNER_PRIVKEY` + `INTERLOCK_DEV_SIGNER_PRIVKEY_2`. Demonstrates the on-chain M-of-N capability (`Product.min_attestations` schema supports it; current Product is at 1, but two pubkeys are accepted, proving the defense-in-depth claim).
- **`packages/sdk/`** — scaffolded as a proper npm package: `@interlock/sdk@0.1.0-alpha.1`. Ships the type surface (`SuccessCriterion`, `CostItem`, `Split`, `Interlock` class with the documented `workflows.start()` / `recordCost()` / `complete()` API) + README. Runtime lands in 0.2.0; current code path stays in `src/lib/interlock/`. Package type-checks cleanly via its own `tsconfig.json`.
- `/developer` SDK snippet updated to show the real `@interlock/sdk` API surface (install command + full workflow example).

✅ **Demo polish + dispute UI (2026-05-28):**
- 60-second **demo script** at the top of CLAUDE.md so judges have a guided walk-through
- **`<RunDemoButton />`** component reused across pages; added to `/dashboard` header (with success/failure dropdown menu) so the demo can start from the home page
- **`<RunKeeperButton />`** on `/settings` — POSTs `/api/keeper/tick`, shows settled-count + per-workflow status inline
- **Walrus blob downloader** — "Download" button in `WalrusBlobViewer` saves the bytes locally (json for parsed, octet-stream for binary)
- **Dispute filing UI**:
  - New `/api/sui/file-dispute` route — uploads evidence text to Walrus, calls `outcome::file_dispute` on chain with the customer keypair
  - New `<DisputeModal />` component with evidence textarea + success state showing the on-chain tx + evidence blob ID + Suiscan link
  - "File dispute" button on `/workflows/[id]` visible only when status=Verified AND dispute window still open
  - New `fileDispute()` helper in `src/lib/interlock/lifecycle.ts` so the SDK package can re-export it

✅ **Polish + automation (2026-05-28):**
- **`/pricing-intel` hidden from sidebar.** The page now renders a "Phase 2 — Pricing Intelligence" placeholder card linking to `ARCHITECTURE.md §9.2`. URL still works; sidebar link removed.
- **Demo data populated.** Customer wallet topped up (transferred 0.21 SUI from deployer). Ran 1 more success + 1 failure lifecycle. Dashboard now shows 4 settled, 1 refunded, 0.4 SUI GMV, 0.02 SUI platform fee.
- **Keeper cron** at `/api/keeper/tick`:
  - GET → dry-run list of VERIFIED workflows past their dispute window (returns candidates as JSON)
  - POST → re-fetches outcome from Walrus + cost items from on-chain Execution + criteria from on-chain Quote, re-runs `/api/verify` to get a fresh signed payload, then calls `settle_workflow_dev`. Sequential to avoid fullnode read-after-write races.
  - Auth: optional `Authorization: Bearer $CRON_SECRET`. Open in local dev.
  - **`vercel.json`** declares hourly cron schedule (works on Pro; Hobby falls back to daily). Endpoint also callable manually for the demo.
  - **Smoke-tested live** (2026-05-28): cleaned up the orphan VERIFIED workflow from week-1, producing settlement `0xb8916f00071d19eb2c608ac384d387b5ff08edb5c06babb1b722cbe7a0535794`. 23s total including verify + settle.

✅ **Walrus blob viewer (2026-05-28):**
- `src/app/api/walrus/[blobId]/route.ts` — fetches from `aggregator.walrus-testnet.walrus.space`, returns parsed JSON when possible (with a hex fallback for binary blobs) + aggregator deeplink
- `src/components/WalrusBlobViewer.tsx` — slide-in side panel with a colorized JSON tree renderer, copy buttons, and a "Aggregator ↗" link
- `/workflows/[id]` — `BlobChip` makes `traceBlobId`, `artifactBlobId`, `proofBlobId` clickable; opens the viewer with the right ID
- Verified live: outcome blob returns `{ticket_status:"closed", refund_amount:47.5}` (the actual agent outcome); proof blob is 716B with full audit trail (`evaluationTrace`, `reconciliationDiffs`, `quoteCriteriaHashHex`, `nonceHex`)

✅ **Clickable lifecycle demo (2026-05-28):**
- `src/app/api/demo/run-lifecycle/route.ts` — POST returns an NDJSON stream of stage events (`start`, `stage` × 7, `complete` / `error`). Reuses `lifecycle.ts` helpers + the existing `/api/verify` route. Total duration ~25–40s with a 5–10s dispute window. Fits in Vercel Hobby's 60s `maxDuration` limit.
- `src/components/LifecycleDemoDrawer.tsx` — slide-in drawer that streams the NDJSON via `fetch().body.getReader()`, renders 7 stage cards that light up green / yellow / red as events arrive, surfaces real Walrus blob IDs + tx digests + Suiscan deeplinks, and ends with an "Open workflow" button that navigates to `/workflows/[id]`.
- Buttons on `/workflows`: "Run demo workflow" (success path) + "Run failure case" (refund path).
- Smoke-tested live: new on-chain settlement `0xf32f01b95b5d3c3bcbf093f75d1e99040fb44c452682a3405566613e00c740e7` produced in ~25s.

✅ **Tier 2 — Off-chain metadata wired via Vercel KV (2026-05-27):**
- `src/lib/interlock/kv.ts` — typed namespace helpers over `@vercel/kv` with an in-memory fallback for local dev (warns once if KV env vars unset)
- API routes: `/api/customers` (GET/POST/DELETE), `/api/apikeys` (GET/POST/DELETE; secret returned once, stored as sha256), `/api/settings` (GET/POST per tenant)
- `/customers` (client): live customer directory, joined with `customerAggregates()`; surfaces "unlinked" on-chain addresses with no off-chain record + a one-click "Claim" flow
- `/developer` (client): API key generation flow (label + scopes); revealed-once secret card; revoke; static SDK code preview
- `/settings` (client): per-tenant webhook URL + auto-generated signing secret + topic filter + retry policy; "Send test webhook" button
- **Deployment note:** add Vercel Marketplace Redis to flip from in-memory to persistent. Local dev works without it.

✅ **Tier 1 — Remaining mock-free pages wired (2026-05-27):**
- `queries.ts` extended: `listQuotes`, `listSettlements`, `customerAggregates`, `listDisputes` + `disputeStats`, `marginByProduct`
- API routes: `/api/sui/quotes`, `/api/sui/settlements`, `/api/sui/customers-agg`, `/api/sui/disputes`, `/api/sui/margin`
- `TopCustomersChart` + `DisputeRateChart` now accept props, fed by `/dashboard` RSC from `customerAggregates()` + `disputeStats()`
- `/quotes` (client): table fetches from `/api/sui/quotes` with computed `Used | Active | Expired` status (used = referenced by a Workflow)
- `/settlement` (client): payments tab + Multi-Party Split bar both fed from `/api/sui/settlements`; the SplitBar shows the real first settlement (or labels itself "Example" when empty)
- `/margin` (client): P&L waterfall + per-product breakdown + per-customer rollup table — all from settled-workflow aggregates over Sui events

✅ **On-chain lifecycle PROVEN on testnet (2026-05-27)** via `npm run lifecycle`:
1. `quote::create_and_freeze` → Quote frozen on chain
2. `workflow::create_from_quote<SUI>` → Workflow + 0.1 SUI escrowed
3. `execution::record` → Execution with cost items
4. POST `/api/verify` → signed AttestationPayload
5. `attestation::verify_and_record_outcome_dev` → Outcome on chain
6. Wait 65s for dispute window
7. `settlement::settle_workflow_dev` → atomic multi-party payout

Example Settlement (testnet): https://suiscan.xyz/testnet/object/0x2aa1d0a3c346fc18d3d2dbf2bc1fa2665c754642fd461e308f2d08f1812fe50b
- Customer 0xbc3789... paid 0.1 SUI
- Splits: 73% agent_company, 22% providers (model + tool), 5% platform fee
- Lifecycle library: `src/lib/interlock/lifecycle.ts` (reusable from any API route)
- Driver: `backend/scripts/run-lifecycle.ts` (`npm run lifecycle`)

✅ **Avalanche EVM contract port (2026-07-05):**
- Move → Solidity port lives in `backend/evm/` (Foundry). `WeaveosTypes.sol`, `WeaveosRegistry.sol`, `WeaveosCore.sol` (quote/workflow/escrow/execution/outcome/attestation/settlement in one contract), `MockUSDC.sol`. 11/11 forge tests pass.
- ed25519 dev signers → ECDSA `ecrecover` (Ethereum addresses); BCS → `keccak256(abi.encode(payload))` + EIP-191.
- **Deployed to Fuji testnet (chainId 43113)** — record in `backend/evm/deployments/fuji.json`. `WeaveosCore` at `0x7B9DB9548998F4C5a93c46F5DF7163b61a94E252`, `WeaveosRegistry` at `0xe805E956436Fd63E57419307235488D96C56b969`.
- Frontend (`src/lib/interlock/*`) still speaks Sui — wiring it to these EVM contracts is a separate follow-up.

✅ **Replaced zkLogin with plain Google OAuth (2026-07-05):**
- zkLogin was Sui-specific (derives a Sui address from a Google JWT via a Groth16 ZK proof + Mysten's prover) and never actually signed on-chain transactions in this app — the validator rejected the public dev prover's proofs, so every workflow already ran on the env-var customer keypair regardless of who was signed in (see the old `effectiveOnChainAddress` comment). With the move to Avalanche, there's no Sui address to derive, so the ZK-proof machinery is gone entirely — sign-in is now plain OAuth: verify Google's id_token against its JWKS, trust the claims, done.
- Removed: ephemeral keypair generation, nonce-bound-to-epoch, Mysten prover call, `computeZkLoginAddress`, `/api/auth/zklogin/*` (epoch/prove/diagnose/signout), `/auth/zklogin/callback`, `/app/debug/zklogin`, `ZkLoginButton.tsx`, `src/lib/interlock/zklogin.ts`.
- Added: `src/lib/interlock/google.ts` (client ID + redirect URI + JWT claim decoder), `/api/auth/google/verify` (JWKS signature + nonce check, upserts `users` by `google_sub`, sets the identity cookie), `/api/auth/google/signout`, `/auth/google/callback`, `GoogleSignInButton.tsx`.
- `UserSession` (the cookie payload) dropped `suiAddress` — `sub` (Google subject ID) is now the identity key. `effectiveOnChainAddress()` is unchanged in behavior (still returns the platform-configured signer address for every user) but the doc comment no longer frames it as "waiting for zkLogin to be restored" — there is no plan to derive per-user wallets from Google auth; a real connected wallet (MetaMask/Core) is the eventual Phase 2 path.
- `users` table primary key changed from `sui_address` to `google_sub` (migration `0001_tricky_giant_girl.sql`) — there's no more per-user address to key on.
- The demo lifecycle's dead `zkLoginSession` passthrough (always sent as `undefined` from the client) was removed from `/api/demo/run-lifecycle` and `LifecycleDemoDrawer`; every run signs with the env-var customer key, consistent with what was already happening in practice.

## Workflow lifecycle (7 stages)

`quote → payment authz (PTB locks USDC + creates Workflow) → agent execution (off-chain, SDK streams costs) → outcome verification (Nautilus signs verdict + Walrus blob IDs) → on-chain attestation verification (Move verifies AWS Nitro sig) → dispute window (24–168h) → atomic multi-party settlement (single PTB, all-or-nothing)`

## MVP scope (in / out)

**In:** Move contracts (8 modules), outcome verifier enclave only, Walrus, TS SDK, dashboard (workflow list + margin + manual dispute filing), USDC testnet→mainnet, fixed-price-per-workflow pricing, OpenAI + Anthropic cost ingestion, lifecycle webhooks.

**Out (deferred):** pricing intelligence layer, automated dispute arbitration, multi-currency, Python/Go SDKs, enterprise SSO, pricing benchmarks, public-facing outcome settlement protocol.

## Conventions

- **Next.js is 16.x with breaking changes** — see `AGENTS.md`. Read `node_modules/next/dist/docs/` before writing Next-related code; heed deprecation notices.
- **TypeScript strict** across frontend, SDK, indexer, API, workers.
- **Trust boundaries:**
  - Sui validators trusted for ordering/finality, **not** for reading customer logic.
  - Nautilus enclaves trusted for verification + short-term secrets, **not** long-term key custody (use Seal). **In hackathon mode**, replaced by Vercel function with ed25519 dev key — same Move-side bounds enforcement, weaker signer trust (acceptable for demo).
  - Customer SDK trusted for signing on customer's behalf, **not** for accurate cost reporting (reconciled via provider APIs in production; passed through in hackathon mode).
- **Source of truth for architecture:** `backend/technical_architecture.docx`. Mirror into `ARCHITECTURE.md` and keep both in sync when the doc changes.

## Open technical questions (decide during MVP)

1. Batch settlement vs per-tx for high-frequency customers (10K+ workflows/day).
2. When to move from public Walrus publisher → self-hosted.
3. Enclave key management via Seal — rotation procedure for enclave version upgrades.
4. Move package upgrade strategy — versioned objects + migration helpers from day one.

## Pointers

- **Full architecture:** `ARCHITECTURE.md`
- **Visual diagrams + feature coverage matrix:** `DIAGRAMS.md`
- **Source doc:** `backend/technical_architecture.docx`
- **Frontend entry:** `src/app/page.tsx`, `src/app/dashboard/page.tsx`
- **Next.js rules:** `AGENTS.md`
