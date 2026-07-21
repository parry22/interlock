// Mock connector — no external calls. For local dev + CI. It exercises the full
// framework (auth, signature verify, normalize, reversal windows, polling)
// deterministically, so the ingest/reversal core can be tested without any
// provider credentials.
//
// Raw payload shape (also used as the webhook body):
//   { id, type, entityId, occurredAt?, fields? }
// where `type` is already a canonical event type. Billable types
// (job.completed / hire.started) get a reversal window from config.

import type {
  AuthInput,
  AuthResult,
  Connection,
  Connector,
  HealthResult,
  ProviderCapabilities,
  RawInboundEvent,
  RawWebhookRequest,
  CanonicalOutcomeEvent,
} from "../types";
import { graceWindowEnd, hmacHex, retentionWindowEnd, safeEqual, toMs } from "./util";

type MockPayload = {
  id: string;
  type: string;
  entityId: string;
  occurredAt?: number | string;
  fields?: Record<string, unknown>;
};

const capabilities: ProviderCapabilities = {
  supportsWebhooks: true,
  webhookEventTypes: [
    "job.completed",
    "invoice.paid",
    "invoice.refunded",
    "hire.started",
    "employment.terminated",
    "candidate.stage_change",
  ],
  polledEventTypes: [],
  rateLimit: { requests: 1000, windowMs: 60_000 },
  authKind: "api_key",
  vertical: "generic",
};

export const mockConnector: Connector = {
  sourceSystem: "mock",
  capabilities,

  async authenticate(input: AuthInput): Promise<AuthResult> {
    return { ok: true, creds: { apiKey: input.params.apiKey ?? "mock-key" } };
  },

  async subscribe(): Promise<{ mode: "webhook"; registered: boolean }> {
    return { mode: "webhook", registered: true };
  },

  verifyWebhookSignature(req: RawWebhookRequest, conn: Connection): boolean {
    // If no secret configured, accept (dev convenience). Otherwise require a
    // matching HMAC-SHA256 in x-mock-signature.
    if (!conn.webhookSecret) return true;
    const sig = req.headers["x-mock-signature"] ?? "";
    return safeEqual(sig, hmacHex(conn.webhookSecret, req.rawBody));
  },

  sourceEventId(rawPayload: unknown): string {
    return String((rawPayload as MockPayload)?.id ?? "");
  },

  normalize(rawPayload: unknown, conn: Connection): CanonicalOutcomeEvent[] {
    const p = rawPayload as MockPayload;
    if (!p?.id || !p?.type || !p?.entityId) return [];
    const occurredAt = toMs(p.occurredAt);
    let reversalWindowExpiresAt: number | null = null;
    if (p.type === "hire.started") reversalWindowExpiresAt = retentionWindowEnd(occurredAt, conn);
    else if (p.type === "job.completed") reversalWindowExpiresAt = graceWindowEnd(occurredAt, conn);

    return [
      {
        sourceSystem: "mock",
        sourceEventId: p.id,
        eventType: p.type,
        entityId: p.entityId,
        occurredAt,
        normalizedFields: p.fields ?? {},
        confidence: 1,
        reversalWindowExpiresAt,
      },
    ];
  },

  async poll(): Promise<RawInboundEvent[]> {
    return [];
  },

  async healthCheck(): Promise<HealthResult> {
    return { healthy: true, detail: "mock connector is always healthy" };
  },
};
