# Interlock

**Pricing Intelligence for the Agent Economy.**

Interlock is an AI-native billing & outcome-settlement platform. Customers run AI agents; Interlock quotes them, escrows USDC, independently verifies outcomes (including against real downstream systems of record via its connector framework), and atomically settles multi-party payouts — agent company, model providers, tool APIs, humans-in-the-loop, and platform fee — in a single on-chain transaction.

## Stack

- **Frontend**: Next.js (App Router) + React + TypeScript + Tailwind
- **Chain**: Avalanche (Fuji testnet) — Solidity contracts for escrow, quotes, outcomes, and atomic multi-party settlement
- **Storage**: Walrus (execution traces, outcome artifacts, dispute evidence)
- **Database**: Postgres (Drizzle ORM) — indexed on-chain state + off-chain customer/webhook/connector data
- **Verification**: ed25519/ECDSA dev-signer verifier today; architecture reserves the path to hardware-attested (Nitro enclave) verification
- **Connectors**: a pluggable `Connector` framework that independently confirms claimed outcomes against a customer's real system of record (field-service platforms, ATS/HRIS, etc.) before a billing event finalizes

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in DB, chain, and encryption keys
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run the unit test suite |
| `npm run db:migrate` | Apply pending Postgres migrations |
| `npm run lifecycle` | Run a full on-chain quote → settlement lifecycle against Avalanche Fuji |

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — full system architecture
- [`DIAGRAMS.md`](DIAGRAMS.md) — visual diagrams + feature coverage
- [`docs/connectors.md`](docs/connectors.md) — connector framework: webhook vs. polling per provider, reversal/gaming protection, provider quirks

## Deploy

The app is a standard Next.js project — deploy to [Vercel](https://vercel.com/new) with the required environment variables configured (database URL, chain RPC + contract addresses, signing keys, encryption key).
