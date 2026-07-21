#!/usr/bin/env tsx
// Seed five distinct demo agents into the marketplace.
//
// Each agent has its own pricing, workflow recipe, and success criteria so
// the side-by-side comparison view has real material to differentiate them.
// Idempotent via `ON CONFLICT (slug) DO UPDATE` — re-running refreshes the
// agents in place without creating duplicates.

import { db, agents, type NewAgent } from "@/lib/db";

const DEMO_OWNER =
  process.env.INTERLOCK_CUSTOMER_ADDRESS ??
  "0xbc3789cb8bcfb43926f6d60382ca7e1a1664146a5f6ea0d4078e622fd3eb4c73";

const now = Date.now();

const SEED: NewAgent[] = [
  {
    ownerAddress: DEMO_OWNER,
    slug: "refundo-v1",
    name: "Refundo",
    description:
      "Resolves customer refund tickets end-to-end. Reads the ticket, decides eligibility, drafts the reply, and closes the case. Best for support teams handling < $100 refund requests.",
    taskTags: ["support", "refund", "tickets", "customer-service"],
    workflowSpec: {
      steps: [
        { kind: "model_call", label: "Classify ticket intent", provider: "Claude Sonnet", costNote: "~1.5k tokens" },
        { kind: "tool_call", label: "Fetch order from Shopify", provider: "shopify.orders.get", costNote: "1 API call" },
        { kind: "model_call", label: "Draft refund response", provider: "Claude Sonnet", costNote: "~3k tokens" },
        { kind: "tool_call", label: "Post reply + close ticket", provider: "zendesk.tickets.update", costNote: "2 API calls" },
      ],
    },
    criteriaTemplate: {
      type: "all_of",
      criteria: [
        { type: "exact", path: "/ticket_status", value: "closed" },
        { type: "numeric_threshold", path: "/refund_amount", op: "<=", value: 100 },
      ],
    },
    exampleOutcome: { ticket_status: "closed", refund_amount: 47.5 },
    pricingModel: "fixed",
    priceBaseUnits: 100_000_000, // 0.1 SUI
    status: "active",
    createdAtMs: now,
    updatedAtMs: now,
  },
  {
    ownerAddress: DEMO_OWNER,
    slug: "refundo-pro",
    name: "Refundo Pro",
    description:
      "Premium refund agent with 2-of-3 multi-LLM voting and a mandatory human review gate on disputed refunds above $200. Slower and pricier than Refundo v1, but designed for accuracy on edge cases.",
    taskTags: ["support", "refund", "tickets", "customer-service", "high-stakes"],
    workflowSpec: {
      steps: [
        { kind: "model_call", label: "Triage (Claude + GPT + Gemini)", provider: "3-way ensemble", costNote: "~5k tokens total" },
        { kind: "tool_call", label: "Fetch order + payment history", provider: "stripe + shopify", costNote: "2 API calls" },
        { kind: "model_call", label: "Risk score the refund", provider: "Claude Opus", costNote: "~2k tokens" },
        { kind: "human_review", label: "Human gate (if risk > 0.7)", costNote: "$0.50 per review on average" },
        { kind: "tool_call", label: "Issue refund + close ticket", provider: "stripe.refunds.create", costNote: "2 API calls" },
      ],
    },
    criteriaTemplate: {
      type: "all_of",
      criteria: [
        { type: "exact", path: "/ticket_status", value: "closed" },
        { type: "exact", path: "/human_reviewed", value: true },
      ],
    },
    exampleOutcome: {
      ticket_status: "closed",
      human_reviewed: true,
      risk_score: 0.82,
      refund_amount: 215,
    },
    pricingModel: "fixed",
    priceBaseUnits: 350_000_000, // 0.35 SUI
    status: "active",
    createdAtMs: now,
    updatedAtMs: now,
  },
  {
    ownerAddress: DEMO_OWNER,
    slug: "lex-summarize",
    name: "Lex Summarizer",
    description:
      "Summarizes long legal documents into 5-bullet briefs with cited sections. Single-pass model call. Cheap and fast — best for first-pass document triage, not for legal advice.",
    taskTags: ["legal", "summarization", "documents", "research"],
    workflowSpec: {
      steps: [
        { kind: "model_call", label: "Chunk + summarize", provider: "Claude Haiku", costNote: "~12k tokens per doc" },
        { kind: "compute", label: "Citation post-processing", costNote: "~50ms" },
      ],
    },
    criteriaTemplate: {
      type: "all_of",
      criteria: [
        { type: "numeric_threshold", path: "/summary_bullets", op: ">=", value: 5 },
        { type: "exact", path: "/has_citations", value: true },
      ],
    },
    exampleOutcome: {
      summary_bullets: 7,
      has_citations: true,
      doc_pages: 42,
    },
    pricingModel: "fixed",
    priceBaseUnits: 50_000_000, // 0.05 SUI
    status: "active",
    createdAtMs: now,
    updatedAtMs: now,
  },
  {
    ownerAddress: DEMO_OWNER,
    slug: "code-review-bot",
    name: "Code Review Bot",
    description:
      "Reviews pull requests for obvious bugs, security issues, and style violations. Posts inline comments + a summary verdict. Best for catching low-hanging fruit before a human reviewer touches the PR.",
    taskTags: ["engineering", "code-review", "automation"],
    workflowSpec: {
      steps: [
        { kind: "tool_call", label: "Fetch PR diff", provider: "github.pulls.diff", costNote: "1 API call" },
        { kind: "model_call", label: "Bug + security scan", provider: "Claude Sonnet", costNote: "~8k tokens" },
        { kind: "model_call", label: "Style + naming pass", provider: "Claude Haiku", costNote: "~3k tokens" },
        { kind: "tool_call", label: "Post inline comments", provider: "github.reviews.create", costNote: "N API calls" },
      ],
    },
    criteriaTemplate: {
      type: "all_of",
      criteria: [
        { type: "exact", path: "/review_posted", value: true },
        { type: "numeric_threshold", path: "/comment_count", op: ">=", value: 1 },
      ],
    },
    exampleOutcome: {
      review_posted: true,
      comment_count: 4,
      pr_url: "https://github.com/acme/repo/pull/42",
    },
    pricingModel: "fixed",
    priceBaseUnits: 150_000_000, // 0.15 SUI
    status: "active",
    createdAtMs: now,
    updatedAtMs: now,
  },
  {
    ownerAddress: DEMO_OWNER,
    slug: "lead-enricher",
    name: "Lead Enricher",
    description:
      "Takes a list of company names or domains and returns structured firmographic + contact data. Cross-references public sources + Apollo. Falls back to a human researcher when confidence is low.",
    taskTags: ["sales", "lead-generation", "enrichment", "research"],
    workflowSpec: {
      steps: [
        { kind: "tool_call", label: "Search public web", provider: "tavily.search", costNote: "1 API call per lead" },
        { kind: "tool_call", label: "Apollo lookup", provider: "apollo.companies.search", costNote: "1 API call per lead" },
        { kind: "model_call", label: "Reconcile + score", provider: "Claude Sonnet", costNote: "~2k tokens per lead" },
        { kind: "human_review", label: "Researcher fallback (if confidence < 0.6)", costNote: "$1 per lead on average" },
      ],
    },
    criteriaTemplate: {
      type: "all_of",
      criteria: [
        { type: "numeric_threshold", path: "/leads_enriched", op: ">=", value: 1 },
        { type: "numeric_threshold", path: "/confidence", op: ">=", value: 0.6 },
      ],
    },
    exampleOutcome: {
      leads_enriched: 24,
      confidence: 0.82,
      sources: ["apollo", "tavily"],
    },
    pricingModel: "fixed",
    priceBaseUnits: 200_000_000, // 0.2 SUI
    status: "active",
    createdAtMs: now,
    updatedAtMs: now,
  },
];

async function main(): Promise<void> {
  const d = db();
  for (const a of SEED) {
    await d
      .insert(agents)
      .values(a)
      .onConflictDoUpdate({
        target: agents.slug,
        set: {
          name: a.name,
          description: a.description,
          taskTags: a.taskTags,
          workflowSpec: a.workflowSpec,
          criteriaTemplate: a.criteriaTemplate,
          exampleOutcome: a.exampleOutcome,
          pricingModel: a.pricingModel,
          priceBaseUnits: a.priceBaseUnits,
          status: a.status,
          updatedAtMs: now,
        },
      });
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${a.slug}`);
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${SEED.length} agents.`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
