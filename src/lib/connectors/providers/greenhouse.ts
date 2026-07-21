// Greenhouse connector (recruiting ATS).
//
// WEBHOOK-PRIMARY via Greenhouse "Web Hooks". Greenhouse signs each delivery
// with HMAC-SHA256 over the raw body using a per-webhook secret key; the header
// is `Signature: sha256 <hexdigest>`. Auth for the Harvest API (polling
// fallback) is HTTP Basic with the API key as the username.
//
// entityId = candidate EMAIL (lowercased) — the shared key that lets a BambooHR
// termination reverse a Greenhouse hire (see docs/connectors.md). Greenhouse
// itself never emits terminations; retention reversal is cross-connector.
//
// Quirks:
//   • `hire.started` has a retention window (default 90d) → provisional.
//   • Greenhouse has no termination event: do NOT expect reversal from here.
//   • Harvest rate limit ~50 req / 10s; 429 + Retry-After.

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

const HARVEST_BASE = "https://harvest.greenhouse.io/v1";

const capabilities: ProviderCapabilities = {
  supportsWebhooks: true,
  webhookEventTypes: ["candidate.stage_change", "offer.accepted", "hire.started"],
  polledEventTypes: [], // Harvest polling exists but webhooks cover our events
  rateLimit: { requests: 50, windowMs: 10_000 },
  authKind: "api_key",
  vertical: "recruiting",
};

type GhCreds = { apiKey?: string };

type GhWebhook = {
  action?: string;
  payload?: {
    application?: {
      id?: number;
      status?: string;
      candidate_id?: number;
      last_activity_at?: string;
      current_stage?: { name?: string };
    };
    candidate?: { id?: number; email_addresses?: Array<{ value?: string }> };
    // Greenhouse includes a top-level id on some payloads
  };
};

function candidateEmail(w: GhWebhook): string {
  const emails = w.payload?.candidate?.email_addresses;
  const email = emails?.find((e) => e.value)?.value;
  return (email ?? `ghid:${w.payload?.candidate?.id ?? w.payload?.application?.candidate_id ?? "unknown"}`).toLowerCase();
}

export const greenhouseConnector: Connector = {
  sourceSystem: "greenhouse",
  capabilities,

  async authenticate(input: AuthInput): Promise<AuthResult> {
    const apiKey = input.params.apiKey;
    if (!apiKey) return { ok: false, error: "greenhouse: apiKey required" };
    try {
      const auth = Buffer.from(`${apiKey}:`).toString("base64");
      const resp = await fetch(`${HARVEST_BASE}/candidates?per_page=1`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!resp.ok) return { ok: false, error: `greenhouse auth failed: ${resp.status}` };
      return { ok: true, creds: { apiKey } };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async subscribe(): Promise<{ mode: "webhook"; registered: boolean; note: string }> {
    return {
      mode: "webhook",
      registered: false,
      note: "Configure Greenhouse Web Hooks (Dev Center) → /api/connectors/greenhouse/webhook with a signing secret.",
    };
  },

  verifyWebhookSignature(req: RawWebhookRequest, conn: Connection): boolean {
    if (!conn.webhookSecret) return false;
    const header = req.headers["signature"] ?? req.headers["Signature"] ?? "";
    // Format: "sha256 <hexdigest>"
    const expected = `sha256 ${hmacHex(conn.webhookSecret, req.rawBody)}`;
    return safeEqual(header, expected);
  },

  sourceEventId(rawPayload: unknown): string {
    const w = rawPayload as GhWebhook;
    const app = w.payload?.application;
    return `${w.action ?? "event"}:${app?.id ?? ""}:${app?.last_activity_at ?? ""}`;
  },

  normalize(rawPayload: unknown, conn: Connection): CanonicalOutcomeEvent[] {
    const w = rawPayload as GhWebhook;
    const app = w.payload?.application;
    if (!w.action || !app) return [];
    const entityId = candidateEmail(w);
    const occurredAt = toMs(app.last_activity_at);
    const base = {
      sourceSystem: "greenhouse",
      sourceEventId: this.sourceEventId(rawPayload),
      entityId,
      occurredAt,
    };

    switch (w.action) {
      case "candidate_hired":
        return [
          {
            ...base,
            eventType: "hire.started",
            normalizedFields: { applicationId: app.id, candidateId: app.candidate_id, email: entityId },
            confidence: 1,
            reversalWindowExpiresAt: retentionWindowEnd(occurredAt, conn),
          },
        ];
      case "candidate_stage_change": {
        const stage = (app.current_stage?.name ?? "").toLowerCase();
        // Offer acceptance shows up as a stage change into an offer/hired stage.
        if (stage.includes("offer")) {
          return [
            {
              ...base,
              eventType: "offer.accepted",
              normalizedFields: { applicationId: app.id, stage: app.current_stage?.name, email: entityId },
              confidence: 1,
            },
          ];
        }
        return [
          {
            ...base,
            eventType: "candidate.stage_change",
            normalizedFields: { applicationId: app.id, stage: app.current_stage?.name, email: entityId },
            confidence: 1,
          },
        ];
      }
      default:
        return [];
    }
  },

  async poll(): Promise<RawInboundEvent[]> {
    return []; // webhooks cover our event set
  },

  async healthCheck(conn: Connection): Promise<HealthResult> {
    const creds = conn.creds as GhCreds;
    if (!creds.apiKey) return { healthy: false, detail: "no api key" };
    try {
      const auth = Buffer.from(`${creds.apiKey}:`).toString("base64");
      const resp = await fetch(`${HARVEST_BASE}/candidates?per_page=1`, { headers: { Authorization: `Basic ${auth}` } });
      return resp.ok ? { healthy: true } : { healthy: false, detail: `HTTP ${resp.status}` };
    } catch (e) {
      return { healthy: false, detail: (e as Error).message };
    }
  },
};
