// Connector framework — core types.
//
// A Connector integrates a customer's downstream system of record (field-service
// platform, ATS, HRIS) so Interlock can INDEPENDENTLY confirm a claimed outcome
// actually happened before finalizing a billing event. Every provider implements
// the same `Connector` interface; core logic (webhook intake, polling, retry,
// reversal) only ever talks to this interface, so a new provider is a new file +
// one registry line — no core edits.
//
// Design decisions locked with the team (2026-07-06):
//   • Runtime = Postgres tables + Vercel Cron state machine (no queue lib).
//   • Credentials AES-256-GCM encrypted at rest (src/lib/db/encryption.ts).
//   • Tenancy key `customerId` = customers.address.
//   • Finalized events are stored + emitted (via webhook_deliveries); wiring to
//     on-chain settlement is a deliberate follow-up.

// === Canonical event (vertical-agnostic storage shape) ===

/** Coarse vertical, for routing/reporting. Storage stays vertical-agnostic. */
export type Vertical = "field_service" | "recruiting" | "generic";

/** Canonical outcome event types across all connectors. String union kept open
 *  (`| string`) so a new connector can introduce a type without editing core,
 *  while the known set gives call sites autocomplete + exhaustiveness where it
 *  matters (the reversal classifier). */
export type CanonicalEventType =
  // field service
  | "job.booked"
  | "job.completed"
  | "invoice.paid"
  | "invoice.refunded"
  | "job.disputed"
  // recruiting
  | "candidate.stage_change"
  | "offer.accepted"
  | "hire.started"
  | "hire.retained_30"
  | "hire.retained_60"
  | "hire.retained_90"
  | "employment.terminated"
  | (string & {});

/** What normalize() produces. The persistence layer stamps ids/timestamps and
 *  fills customerId/connectorId from the Connection — the connector only
 *  supplies what it can read from the provider payload. */
export type CanonicalOutcomeEvent = {
  sourceSystem: string;
  /** Provider's stable event/delivery id — the idempotency key. */
  sourceEventId: string;
  eventType: CanonicalEventType;
  /** Provider's entity this is about (job / candidate / employee id). */
  entityId: string;
  /** When it happened per the provider (epoch ms). */
  occurredAt: number;
  /** Normalized, vertical-agnostic fields (e.g. { status, amount, currency }). */
  normalizedFields: Record<string, unknown>;
  /** 1.0 for a direct system-of-record event; lower for polled/inferred. */
  confidence?: number;
  /** Set for events that must survive a reversal window before finalizing
   *  (hire.started, job.completed). null/undefined → finalize immediately. */
  reversalWindowExpiresAt?: number | null;
  /** True when this event REVERSES a prior provisional event for the same
   *  entity (termination, refund, dispute) — drives the reversal classifier. */
  isReversal?: boolean;
};

// === Connection (decrypted, passed to connector methods) ===

export type Connection = {
  id: string; // connectorId
  customerId: string;
  sourceSystem: string;
  authKind: "oauth" | "api_key";
  /** Decrypted credential bag (tokens / api keys / subdomain / tenant id). */
  creds: Record<string, unknown>;
  /** Decrypted provider webhook signing secret, if any. */
  webhookSecret?: string;
  /** Customer-configurable knobs (retentionDays, gracePeriodDays, ...). */
  config: ConnectionConfig;
  pollCursorMs?: number | null;
};

export type ConnectionConfig = {
  /** Recruiting: days a hire must be retained before it finalizes. Default 90. */
  retentionDays?: number;
  /** Field service: days to wait for a refund/dispute if not payment-gated. */
  gracePeriodDays?: number;
  /** Arbitrary provider-specific config. */
  [k: string]: unknown;
};

// === Connector interface ===

export type ProviderCapabilities = {
  supportsWebhooks: boolean;
  /** Canonical event types this provider delivers via webhook. */
  webhookEventTypes: CanonicalEventType[];
  /** Canonical event types with NO webhook → polling fallback required. */
  polledEventTypes: CanonicalEventType[];
  /** Provider's documented rate limit, for our outbound-call budgeting. */
  rateLimit: { requests: number; windowMs: number };
  authKind: "oauth" | "api_key";
  vertical: Vertical;
};

export type RawWebhookRequest = {
  headers: Record<string, string>;
  /** Exact raw body bytes as received — signature verification MUST use these,
   *  not a re-serialized JSON (whitespace/key-order would break the HMAC). */
  rawBody: string;
};

export type RawInboundEvent = {
  sourceEventId: string;
  payload: unknown;
};

export type AuthResult = { ok: true; creds: Record<string, unknown> } | { ok: false; error: string };
export type SubscribeResult =
  | { mode: "webhook"; registered: boolean; note?: string }
  | { mode: "polling"; note?: string };
export type HealthResult = { healthy: boolean; detail?: string };

export interface Connector {
  readonly sourceSystem: string;
  readonly capabilities: ProviderCapabilities;

  /** Validate / exchange credentials. For OAuth this exchanges a code for
   *  tokens; for API-key providers it validates the key against a cheap
   *  endpoint. Returns the credential bag to encrypt + store. */
  authenticate(input: AuthInput): Promise<AuthResult>;

  /** Register a webhook subscription with the provider, or return a polling
   *  plan when the provider (or this event type) has no webhook. Idempotent. */
  subscribe(conn: Connection): Promise<SubscribeResult>;

  /** Provider-specific webhook signature verification. Returns false on any
   *  missing/invalid signature — the route rejects with 401 and does NOT land
   *  the event. */
  verifyWebhookSignature(req: RawWebhookRequest, conn: Connection): boolean;

  /** Extract the provider's idempotency id from a raw delivery so we can dedupe
   *  BEFORE normalizing (some providers batch multiple entities per delivery;
   *  in that case return the delivery id and emit multiple canonical events). */
  sourceEventId(rawPayload: unknown): string;

  /** Map a raw provider payload → one or more canonical events. Pure: no
   *  network, no db. May return [] to intentionally ignore an irrelevant event. */
  normalize(rawPayload: unknown, conn: Connection): CanonicalOutcomeEvent[];

  /** Polling fallback: fetch events since `sinceMs`. Only meaningful for
   *  providers/event-types without webhooks. Returns raw deliveries that flow
   *  through the same land→normalize path as webhooks. */
  poll(conn: Connection, sinceMs: number): Promise<RawInboundEvent[]>;

  /** Cheap liveness/credentials check for the health endpoint + status column. */
  healthCheck(conn: Connection): Promise<HealthResult>;
}

export type AuthInput = {
  customerId: string;
  /** OAuth: { code, redirectUri }. API key: { apiKey, subdomain?, tenantId?, ... }. */
  params: Record<string, string>;
};
