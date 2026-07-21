// Lever connector (recruiting ATS).
//
// WEBHOOK-PRIMARY. Lever's webhook signature is NOT an HMAC over the body — it
// signs the string `${token}${triggeredAt}` (both present in the payload) with
// the configured signature token, hex-encoded in the payload's `signature`
// field. Auth for the Data API (health/enrichment) is HTTP Basic with the API
// key as username. Sandbox host is api.sandbox.lever.co.
//
// entityId = candidate email (lowercased) when available, else `leverid:<id>`.
//
// Quirks:
//   • Signature is over token+triggeredAt, not the raw body — a real gotcha.
//   • Webhooks carry stage IDs, not names, so `offer.accepted` can only be
//     detected if the customer maps the offer stage id in config.offerStageId.
//   • `candidateHired` → hire.started (retention window, default 90d).

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
import { hmacHex, retentionWindowEnd, safeEqual, toMs } from "./util";

const capabilities: ProviderCapabilities = {
  supportsWebhooks: true,
  webhookEventTypes: ["candidate.stage_change", "offer.accepted", "hire.started"],
  polledEventTypes: [],
  rateLimit: { requests: 10, windowMs: 1_000 },
  authKind: "api_key",
  vertical: "recruiting",
};

type LeverCreds = { apiKey?: string; env?: "sandbox" | "production" };

type LeverWebhook = {
  event?: string;
  triggeredAt?: number;
  token?: string;
  signature?: string;
  data?: {
    candidateId?: string;
    opportunityId?: string;
    contactId?: string;
    toStageId?: string;
    email?: string;
  };
};

function apiBase(env?: string): string {
  return env === "production" ? "https://api.lever.co/v1" : "https://api.sandbox.lever.co/v1";
}

function entityKey(w: LeverWebhook): string {
  const email = w.data?.email;
  return (email ?? `leverid:${w.data?.candidateId ?? w.data?.contactId ?? "unknown"}`).toLowerCase();
}

export const leverConnector: Connector = {
  sourceSystem: "lever",
  capabilities,

  async authenticate(input: AuthInput): Promise<AuthResult> {
    const apiKey = input.params.apiKey;
    if (!apiKey) return { ok: false, error: "lever: apiKey required" };
    const env = (input.params.env as LeverCreds["env"]) ?? "sandbox";
    try {
      const auth = Buffer.from(`${apiKey}:`).toString("base64");
      const resp = await fetch(`${apiBase(env)}/opportunities?limit=1`, { headers: { Authorization: `Basic ${auth}` } });
      if (!resp.ok) return { ok: false, error: `lever auth failed: ${resp.status}` };
      return { ok: true, creds: { apiKey, env } };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async subscribe(): Promise<{ mode: "webhook"; registered: boolean; note: string }> {
    return {
      mode: "webhook",
      registered: false,
      note: "Configure Lever webhooks (Settings → Integrations → Webhooks) → /api/connectors/lever/webhook.",
    };
  },

  verifyWebhookSignature(req: RawWebhookRequest, conn: Connection): boolean {
    if (!conn.webhookSecret) return false;
    let body: LeverWebhook;
    try {
      body = JSON.parse(req.rawBody) as LeverWebhook;
    } catch {
      return false;
    }
    if (!body.token || body.triggeredAt == null || !body.signature) return false;
    const expected = hmacHex(conn.webhookSecret, `${body.token}${body.triggeredAt}`);
    return safeEqual(body.signature, expected);
  },

  sourceEventId(rawPayload: unknown): string {
    const w = rawPayload as LeverWebhook;
    // token is unique per delivery; combine with event for readability.
    return `${w.event ?? "event"}:${w.token ?? `${w.data?.opportunityId ?? ""}:${w.triggeredAt ?? ""}`}`;
  },

  normalize(rawPayload: unknown, conn: Connection): CanonicalOutcomeEvent[] {
    const w = rawPayload as LeverWebhook;
    if (!w.event || !w.data) return [];
    const entityId = entityKey(w);
    const occurredAt = toMs(w.triggeredAt);
    const base = {
      sourceSystem: "lever",
      sourceEventId: this.sourceEventId(rawPayload),
      entityId,
      occurredAt,
    };

    if (w.event === "candidateHired") {
      return [
        {
          ...base,
          eventType: "hire.started",
          normalizedFields: { opportunityId: w.data.opportunityId, candidateId: w.data.candidateId, email: w.data.email },
          confidence: 1,
          reversalWindowExpiresAt: retentionWindowEnd(occurredAt, conn),
        },
      ];
    }
    if (w.event === "candidateStageChange") {
      const offerStageId = conn.config?.offerStageId as string | undefined;
      const isOffer = offerStageId != null && w.data.toStageId === offerStageId;
      return [
        {
          ...base,
          eventType: isOffer ? "offer.accepted" : "candidate.stage_change",
          normalizedFields: { opportunityId: w.data.opportunityId, toStageId: w.data.toStageId },
          confidence: 1,
        },
      ];
    }
    return [];
  },

  async poll(): Promise<RawInboundEvent[]> {
    return [];
  },

  async healthCheck(conn: Connection): Promise<HealthResult> {
    const creds = conn.creds as LeverCreds;
    if (!creds.apiKey) return { healthy: false, detail: "no api key" };
    try {
      const auth = Buffer.from(`${creds.apiKey}:`).toString("base64");
      const resp = await fetch(`${apiBase(creds.env)}/opportunities?limit=1`, { headers: { Authorization: `Basic ${auth}` } });
      return resp.ok ? { healthy: true } : { healthy: false, detail: `HTTP ${resp.status}` };
    } catch (e) {
      return { healthy: false, detail: (e as Error).message };
    }
  },
};
