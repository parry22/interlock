// Interlock Postgres schema.
//
// Ten tables. Two roles:
//   • Mirror of on-chain state: indexed_workflows / _quotes / _settlements / _disputes.
//     The Sui chain is the source of truth; these tables exist for query speed
//     (sub-100ms dashboard reads vs 2-3s of Sui RPC). Refresh via the
//     `/api/keeper/index-tick` cron worker.
//   • Off-chain truth: users / customers / api_keys / tenant_settings /
//     webhook_deliveries / audit_log / indexer_cursor.
//     Postgres is the source of truth for these. PII (email, name) lives here.
//
// Security notes:
//   • Signing secrets (tenant_settings.signing_secret_encrypted) are encrypted
//     at rest with SETTINGS_ENCRYPTION_KEY before insert; never stored plain.
//   • API keys are sha256-hashed before reaching this layer; the raw secret
//     is shown to the user once and never stored.
//   • All JWT-derived user records require a valid Google JWKS signature
//     (enforced at the route layer, not the schema).

import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── Off-chain identity ──────────────────────────────────────────────────────

/** Google-authenticated users — one row per Google `sub`, created on first sign-in. */
export const users = pgTable("users", {
  googleSub: text("google_sub").primaryKey(),
  email: text("email"),
  name: text("name"),
  picture: text("picture"),
  /** Per-user custodial wallet on Avalanche Fuji. Generated at first
   *  sign-in; the private key is AES-256-GCM encrypted at rest with
   *  SETTINGS_ENCRYPTION_KEY and decrypted only to sign this user's own
   *  transactions. */
  walletAddress: text("wallet_address"),
  walletPrivkeyEncrypted: text("wallet_privkey_encrypted"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Off-chain customer directory (formerly KV). Joins to on-chain workflows. */
export const customers = pgTable(
  "customers",
  {
    address: text("address").primaryKey(), // Sui address
    name: text("name").notNull(),
    email: text("email"),
    slug: text("slug").notNull(),
    notes: text("notes"),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
  },
  (t) => ({
    slugUnique: uniqueIndex("customers_slug_unique").on(t.slug),
  }),
);

/** Developer API keys. Only the sha256 hash is stored. */
export const apiKeys = pgTable(
  "api_keys",
  {
    hash: text("hash").primaryKey(), // sha256 of the raw secret
    ownerAddress: text("owner_address").notNull(),
    label: text("label").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    prefix: text("prefix").notNull(), // "wos_AbCdEf" — for UI identification
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    lastUsedAtMs: bigint("last_used_at_ms", { mode: "number" }),
    revokedAtMs: bigint("revoked_at_ms", { mode: "number" }),
  },
  (t) => ({
    ownerIdx: index("api_keys_owner_idx").on(t.ownerAddress),
  }),
);

/** Per-tenant runtime config — webhook delivery, signing secret, retry policy. */
export const tenantSettings = pgTable("tenant_settings", {
  tenantAddress: text("tenant_address").primaryKey(),
  webhookUrl: text("webhook_url").notNull().default(""),
  /** AES-256-GCM ciphertext of the signing secret. Decrypted only at delivery time. */
  signingSecretEncrypted: text("signing_secret_encrypted").notNull().default(""),
  topics: jsonb("topics").$type<string[]>().notNull().default([]),
  retryMaxAttempts: integer("retry_max_attempts").notNull().default(5),
  retryBackoffSeconds: integer("retry_backoff_seconds").notNull().default(30),
  updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
});

// ─── On-chain mirrors (indexed) ──────────────────────────────────────────────

export const indexedWorkflows = pgTable(
  "indexed_workflows",
  {
    id: text("id").primaryKey(),
    customer: text("customer").notNull(),
    productId: text("product_id").notNull(),
    status: integer("status").notNull(), // 0..5
    statusName: text("status_name").notNull(), // computed for readability
    quoteId: text("quote_id"),
    executionId: text("execution_id"),
    outcomeId: text("outcome_id"),
    settlementId: text("settlement_id"),
    totalRevenue: bigint("total_revenue", { mode: "number" }).notNull().default(0),
    totalCost: bigint("total_cost", { mode: "number" }).notNull().default(0),
    margin: bigint("margin", { mode: "number" }).notNull().default(0),
    escrowBalance: bigint("escrow_balance", { mode: "number" }).notNull().default(0),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
    indexedAtMs: bigint("indexed_at_ms", { mode: "number" }).notNull(),
  },
  (t) => ({
    customerIdx: index("workflows_customer_idx").on(t.customer),
    statusIdx: index("workflows_status_idx").on(t.status),
    productIdx: index("workflows_product_idx").on(t.productId),
  }),
);

export const indexedQuotes = pgTable(
  "indexed_quotes",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    customer: text("customer").notNull(),
    price: bigint("price", { mode: "number" }).notNull(),
    pricingModel: integer("pricing_model").notNull(),
    successCriteria: jsonb("success_criteria"),
    successCriteriaHashHex: text("success_criteria_hash_hex").notNull(),
    expiresAtMs: bigint("expires_at_ms", { mode: "number" }).notNull(),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    usedByWorkflowId: text("used_by_workflow_id"),
  },
  (t) => ({
    customerIdx: index("quotes_customer_idx").on(t.customer),
  }),
);

export const indexedSettlements = pgTable(
  "indexed_settlements",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id").notNull(),
    totalSettled: bigint("total_settled", { mode: "number" }).notNull(),
    platformFee: bigint("platform_fee", { mode: "number" }).notNull(),
    settledAtMs: bigint("settled_at_ms", { mode: "number" }).notNull(),
    splits: jsonb("splits")
      .$type<Array<{ recipient: string; amount: number; role: number }>>()
      .notNull(),
  },
  (t) => ({
    workflowIdx: index("settlements_workflow_idx").on(t.workflowId),
    settledAtIdx: index("settlements_settled_at_idx").on(t.settledAtMs),
  }),
);

export const indexedDisputes = pgTable(
  "indexed_disputes",
  {
    id: serial("id").primaryKey(),
    workflowId: text("workflow_id").notNull(),
    outcomeId: text("outcome_id").notNull(),
    evidenceBlobIdHex: text("evidence_blob_id_hex").notNull(),
    filedBy: text("filed_by").notNull(),
    timestampMs: bigint("timestamp_ms", { mode: "number" }).notNull(),
  },
  (t) => ({
    workflowIdx: index("disputes_workflow_idx").on(t.workflowId),
    timestampIdx: index("disputes_timestamp_idx").on(t.timestampMs),
  }),
);

// ─── Operational ─────────────────────────────────────────────────────────────

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: serial("id").primaryKey(),
    tenantAddress: text("tenant_address").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // pending | in_flight | delivered | failed
    attempts: integer("attempts").notNull().default(0),
    nextRetryAtMs: bigint("next_retry_at_ms", { mode: "number" }),
    deliveredAtMs: bigint("delivered_at_ms", { mode: "number" }),
    lastError: text("last_error"),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
  },
  (t) => ({
    statusIdx: index("webhook_deliveries_status_idx").on(t.status),
    tenantIdx: index("webhook_deliveries_tenant_idx").on(t.tenantAddress),
  }),
);

/** Immutable audit log — every mutation that touches off-chain state. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorAddress: text("actor_address").notNull(),
    action: text("action").notNull(), // e.g. "customer.create", "apikey.generate"
    targetId: text("target_id"),
    payload: jsonb("payload"),
    atMs: bigint("at_ms", { mode: "number" }).notNull(),
  },
  (t) => ({
    actorIdx: index("audit_actor_idx").on(t.actorAddress),
    actionIdx: index("audit_action_idx").on(t.action),
    atIdx: index("audit_at_idx").on(t.atMs),
  }),
);

// ─── Agent marketplace ──────────────────────────────────────────────────────

/** Registered agent listings — the supply side of the marketplace. */
export const agents = pgTable(
  "agents",
  {
    id: serial("id").primaryKey(),
    ownerAddress: text("owner_address").notNull(),
    /** URL-safe identifier — used in /agents/[slug]. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** Short tags clients can filter by — ["support", "refund", "tickets"]. */
    taskTags: jsonb("task_tags").$type<string[]>().notNull().default([]),
    /** Ordered workflow steps the agent executes. Stored as a portable JSON
     *  shape so different agents can declare radically different processes. */
    workflowSpec: jsonb("workflow_spec")
      .$type<{
        steps: Array<{
          kind: "model_call" | "tool_call" | "human_review" | "compute";
          label: string;
          provider?: string;
          costNote?: string;
        }>;
      }>()
      .notNull()
      .default({ steps: [] }),
    /** Default success-criteria template (uses the same DSL Quotes use). */
    criteriaTemplate: jsonb("criteria_template").$type<unknown>().notNull().default({}),
    /** Sample outcome JSON the agent declares "looks like a successful run".
     *  Pre-fills the hire form so the demo run satisfies the criteria by
     *  default — clients can edit before submitting. */
    exampleOutcome: jsonb("example_outcome").$type<Record<string, unknown>>().notNull().default({}),
    /** "fixed" today; "per_token" / "tiered" in the future. */
    pricingModel: text("pricing_model").notNull().default("fixed"),
    /** Default escrow price for one workflow, in coin base units. */
    priceBaseUnits: bigint("price_base_units", { mode: "number" }).notNull(),
    /** HTTPS endpoint the platform calls to actually RUN this agent. It
     *  receives { taskInput, criteria } and returns { outcome, costItems? }.
     *  When null, the agent is "declared-only": running it uses the
     *  exampleOutcome instead of executing real code. */
    executionEndpoint: text("execution_endpoint"),
    /** On-chain product id this agent settles against (agentCompany = owner
     *  wallet, so the owner gets paid). Created at registration; falls back
     *  to the platform default product when null. */
    onchainProductId: integer("onchain_product_id"),
    /** "active" / "paused" / "deprecated". Only "active" appears in the marketplace. */
    status: text("status").notNull().default("active"),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (t) => ({
    slugUnique: uniqueIndex("agents_slug_unique").on(t.slug),
    ownerIdx: index("agents_owner_idx").on(t.ownerAddress),
    statusIdx: index("agents_status_idx").on(t.status),
  }),
);

/** Provider rate cards — the published maximum price a provider charges per
 *  unit of work, per cost category. The verifier reconciles every reported
 *  cost against this: a cost line can't claim more than the provider's own
 *  published rate, so a colluding integration can't inflate a payout beyond
 *  what the provider says it charges. One row per (provider, category). */
export const providerRates = pgTable(
  "provider_rates",
  {
    id: serial("id").primaryKey(),
    /** 0x provider address (lowercased). */
    providerAddress: text("provider_address").notNull(),
    /** Cost category: 0 model | 1 tool | 2 human | 3 compute. */
    category: integer("category").notNull(),
    /** Max micro-USDC (1e-6 USDC) chargeable per unit of work. */
    maxPerUnitMicro: bigint("max_per_unit_micro", { mode: "number" }).notNull(),
    /** Human label, e.g. "Claude Sonnet, per 1k tokens". */
    label: text("label"),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (t) => ({
    provCatUnique: uniqueIndex("provider_rates_prov_cat_unique").on(t.providerAddress, t.category),
  }),
);

/** Off-chain link from a chain Workflow back to the agent that fulfilled it.
 *  Set when a client hires an agent through the marketplace; lets the
 *  agent's track record (settled count, dispute rate) be computed without
 *  bloating the Move contract with marketplace metadata. */
export const workflowAgentLinks = pgTable(
  "workflow_agent_links",
  {
    workflowId: text("workflow_id").primaryKey(),
    agentId: integer("agent_id").notNull(),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
  },
  (t) => ({
    agentIdx: index("wfal_agent_idx").on(t.agentId),
  }),
);

/** Saved outcome definitions authored through the guided natural-language flow.
 *  We deliberately store BOTH the original plain-English input (`nlInput`) and
 *  the compiled structured definition (`structuredDef` + the executable
 *  `criterion` + its `criteriaHashHex`), so every billable-outcome rule is
 *  auditable end to end: what the human said, and what the verifier will run.
 *  The verification engine only ever executes `criterion` — never the NL text. */
export const outcomeDefinitions = pgTable(
  "outcome_definitions",
  {
    id: serial("id").primaryKey(),
    /** The agent (Interlock's "connector + vertical") this rule is scoped to. */
    agentId: integer("agent_id").notNull(),
    /** Original natural-language description, verbatim — audit trail. */
    nlInput: text("nl_input").notNull(),
    /** Full CompiledOutcomeDefinition (trigger/conditions/reversal/window). */
    structuredDef: jsonb("structured_def").$type<unknown>().notNull(),
    /** The executable SuccessCriterion the verifier runs, extracted for reuse. */
    criterion: jsonb("criterion").$type<unknown>().notNull(),
    /** sha256 of the canonical criterion bytes — binds to the on-chain quote. */
    criteriaHashHex: text("criteria_hash_hex").notNull(),
    /** Address that authored it (from the session), for the audit trail. */
    createdByAddress: text("created_by_address"),
    /** "active" | "needs_review" — set to needs_review when schema drift is
     *  detected (a referenced field no longer exists on the agent). */
    status: text("status").notNull().default("active"),
    /** Populated when status flips to needs_review: which fields went invalid. */
    driftNote: text("drift_note"),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (t) => ({
    agentIdx: index("outcome_defs_agent_idx").on(t.agentId),
    statusIdx: index("outcome_defs_status_idx").on(t.status),
  }),
);

// ─── Connectors (downstream system-of-record integration) ────────────────────

/** One row per customer ↔ provider connection. Holds encrypted credentials and
 *  per-connection config (retention/grace windows). A connection's `id` is the
 *  `connectorId` stamped on every event it produces. Credentials are AES-256-GCM
 *  encrypted with SETTINGS_ENCRYPTION_KEY — never stored plaintext. */
export const connectorConnections = pgTable(
  "connector_connections",
  {
    id: text("id").primaryKey(), // "conn_<uuid>"
    /** Tenant = customers.address (existing off-chain tenancy key). */
    customerId: text("customer_id").notNull(),
    /** Provider slug: servicetitan | housecallpro | greenhouse | lever | bamboohr | mock. */
    sourceSystem: text("source_system").notNull(),
    displayName: text("display_name"),
    authKind: text("auth_kind").notNull(), // "oauth" | "api_key"
    /** AES-256-GCM ciphertext of the credential JSON (tokens / api keys). */
    credsEncrypted: text("creds_encrypted").notNull().default(""),
    /** AES-256-GCM ciphertext of the provider's webhook signing secret. */
    webhookSecretEncrypted: text("webhook_secret_encrypted"),
    /** Customer-configurable: { retentionDays, gracePeriodDays, ... }. */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("active"), // active | paused | error
    lastError: text("last_error"),
    lastHealthyAtMs: bigint("last_healthy_at_ms", { mode: "number" }),
    /** High-water mark for the polling fallback (ms). */
    pollCursorMs: bigint("poll_cursor_ms", { mode: "number" }),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (t) => ({
    customerIdx: index("connector_conn_customer_idx").on(t.customerId),
    systemIdx: index("connector_conn_system_idx").on(t.sourceSystem),
    statusIdx: index("connector_conn_status_idx").on(t.status),
  }),
);

/** Raw inbound landing + retry state machine. Every provider delivery lands
 *  here FIRST (raw payload stored always = audit trail), is deduped on
 *  (connection, sourceEventId), then normalized into outcome_events. Mirrors
 *  the webhook_deliveries drain pattern: never silently dropped, retried with
 *  exponential backoff by the ingest-tick cron. */
export const inboundEvents = pgTable(
  "inbound_events",
  {
    id: serial("id").primaryKey(),
    connectionId: text("connection_id").notNull(),
    sourceSystem: text("source_system").notNull(),
    /** Provider's event/delivery id — the idempotency key. */
    sourceEventId: text("source_event_id").notNull(),
    rawPayload: jsonb("raw_payload").notNull(),
    /** pending | in_flight | processed | failed | duplicate */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRetryAtMs: bigint("next_retry_at_ms", { mode: "number" }),
    lastError: text("last_error"),
    receivedAtMs: bigint("received_at_ms", { mode: "number" }).notNull(),
    processedAtMs: bigint("processed_at_ms", { mode: "number" }),
  },
  (t) => ({
    dedupe: uniqueIndex("inbound_events_dedupe").on(t.connectionId, t.sourceEventId),
    statusIdx: index("inbound_events_status_idx").on(t.status),
  }),
);

/** Canonical, vertical-agnostic outcome event. Produced by normalize(). Carries
 *  a billing lifecycle so the generic reversal job can finalize/reverse it
 *  without vertical-specific code. */
export const outcomeEvents = pgTable(
  "outcome_events",
  {
    id: text("id").primaryKey(), // "oe_<uuid>"
    customerId: text("customer_id").notNull(),
    connectorId: text("connector_id").notNull(), // → connector_connections.id
    sourceSystem: text("source_system").notNull(),
    sourceEventId: text("source_event_id").notNull(),
    eventType: text("event_type").notNull(), // "job.completed" | "hire.started" | ...
    entityId: text("entity_id").notNull(), // job / candidate / employee id
    occurredAt: bigint("occurred_at", { mode: "number" }).notNull(),
    /** Raw provider payload, co-located with the normalized view (audit). */
    rawPayload: jsonb("raw_payload").notNull(),
    normalizedFields: jsonb("normalized_fields").$type<Record<string, unknown>>().notNull(),
    confidence: real("confidence").notNull().default(1),
    /** null = finalize immediately; else held provisional until this passes. */
    reversalWindowExpiresAt: bigint("reversal_window_expires_at", { mode: "number" }),
    /** provisional | finalized | reversed */
    billingStatus: text("billing_status").notNull().default("provisional"),
    reversedByEventId: text("reversed_by_event_id"),
    finalizedAtMs: bigint("finalized_at_ms", { mode: "number" }),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  },
  (t) => ({
    dedupe: uniqueIndex("outcome_events_dedupe").on(t.connectorId, t.sourceEventId),
    customerIdx: index("outcome_events_customer_idx").on(t.customerId),
    // Cross-connector entity matching: a hire (ATS) and its reversing termination
    // (HRIS) share (customerId, entityId) — entityId is a normalized key (email
    // for people, jobId for jobs), so reversal spans source systems.
    entityIdx: index("outcome_events_entity_idx").on(t.customerId, t.entityId),
    reversalIdx: index("outcome_events_reversal_idx").on(t.billingStatus, t.reversalWindowExpiresAt),
  }),
);

// ─── Operational ────────────────────────────────────────────────────────────

/** Indexer high-water marks. One row per event type the indexer pages through. */
export const indexerCursor = pgTable("indexer_cursor", {
  eventType: text("event_type").primaryKey(),
  lastIndexedAtMs: bigint("last_indexed_at_ms", { mode: "number" }).notNull().default(0),
  lastIndexedDigest: text("last_indexed_digest"),
  isHealthy: boolean("is_healthy").notNull().default(true),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Inferred TypeScript types (for use in route handlers) ───────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type TenantSettings = typeof tenantSettings.$inferSelect;
export type NewTenantSettings = typeof tenantSettings.$inferInsert;
export type IndexedWorkflow = typeof indexedWorkflows.$inferSelect;
export type IndexedQuote = typeof indexedQuotes.$inferSelect;
export type IndexedSettlement = typeof indexedSettlements.$inferSelect;
export type IndexedDispute = typeof indexedDisputes.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type WorkflowAgentLink = typeof workflowAgentLinks.$inferSelect;
export type NewWorkflowAgentLink = typeof workflowAgentLinks.$inferInsert;
