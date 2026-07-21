// Housecall Pro connector (field service).
//
// HCP has real webhooks for job + invoice lifecycle, so this connector is
// WEBHOOK-PRIMARY, with polling as a fallback for accounts/events that don't
// have webhooks enabled. Auth is an API key (Max-plan feature) sent as a
// bearer token.
//
// Canonical entityId = the HCP job id. invoice/payment events resolve their job
// id so they match the completed-job event.
//
// Quirks:
//   • Webhook signing is opt-in per account; when a signing secret is present we
//     verify HMAC-SHA256 over the raw body in `x-hcp-signature`, otherwise we
//     accept (and flag lower confidence). Turn signing on in production.
//   • Event names use dotted lowercase ("job.completed", "invoice.paid").

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
import { graceWindowEnd, hmacHex, safeEqual, toMs } from "./util";

const API_BASE = "https://api.housecallpro.com";

const capabilities: ProviderCapabilities = {
  supportsWebhooks: true,
  webhookEventTypes: ["job.booked", "job.completed", "invoice.paid", "invoice.refunded"],
  polledEventTypes: [],
  rateLimit: { requests: 300, windowMs: 60_000 },
  authKind: "api_key",
  vertical: "field_service",
};

type HcpCreds = { apiKey?: string };

type HcpEvent = {
  event?: string;
  id?: string;
  occurred_at?: string;
  job?: { id?: string; work_status?: string };
  invoice?: { id?: string; job_id?: string; amount?: number; status?: string };
};

const EVENT_MAP: Record<string, CanonicalOutcomeEvent["eventType"]> = {
  "job.scheduled": "job.booked",
  "job.created": "job.booked",
  "job.completed": "job.completed",
  "invoice.paid": "invoice.paid",
  "job.paid": "invoice.paid",
  "invoice.refunded": "invoice.refunded",
};

export const housecallProConnector: Connector = {
  sourceSystem: "housecallpro",
  capabilities,

  async authenticate(input: AuthInput): Promise<AuthResult> {
    const apiKey = input.params.apiKey;
    if (!apiKey) return { ok: false, error: "housecallpro: apiKey required" };
    try {
      const resp = await fetch(`${API_BASE}/company`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!resp.ok) return { ok: false, error: `housecallpro auth failed: ${resp.status}` };
      return { ok: true, creds: { apiKey } };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async subscribe(): Promise<{ mode: "webhook"; registered: boolean; note: string }> {
    // HCP webhooks are configured in the account's developer settings; we can't
    // create them via API on all plans, so we assume they're pointed at our
    // endpoint and note it.
    return { mode: "webhook", registered: false, note: "Point HCP webhooks at /api/connectors/housecallpro/webhook." };
  },

  verifyWebhookSignature(req: RawWebhookRequest, conn: Connection): boolean {
    if (!conn.webhookSecret) return true; // signing opt-in; accept when off
    const sig = req.headers["x-hcp-signature"] ?? "";
    return safeEqual(sig, hmacHex(conn.webhookSecret, req.rawBody));
  },

  sourceEventId(rawPayload: unknown): string {
    const p = rawPayload as HcpEvent;
    return String(p.id ?? `${p.event}:${p.job?.id ?? p.invoice?.id ?? ""}:${p.occurred_at ?? ""}`);
  },

  normalize(rawPayload: unknown, conn: Connection): CanonicalOutcomeEvent[] {
    const p = rawPayload as HcpEvent;
    const eventType = p.event ? EVENT_MAP[p.event] : undefined;
    if (!eventType) return [];
    const occurredAt = toMs(p.occurred_at);
    const confidence = conn.webhookSecret ? 1 : 0.9; // unsigned webhook → slightly lower

    if (eventType === "invoice.paid" || eventType === "invoice.refunded") {
      const jobId = String(p.invoice?.job_id ?? p.job?.id ?? "");
      if (!jobId) return [];
      return [
        {
          sourceSystem: "housecallpro",
          sourceEventId: this.sourceEventId(rawPayload),
          eventType,
          entityId: jobId,
          occurredAt,
          normalizedFields: { invoiceId: p.invoice?.id, jobId, amount: p.invoice?.amount, status: p.invoice?.status },
          confidence,
        },
      ];
    }

    const jobId = String(p.job?.id ?? "");
    if (!jobId) return [];
    return [
      {
        sourceSystem: "housecallpro",
        sourceEventId: this.sourceEventId(rawPayload),
        eventType,
        entityId: jobId,
        occurredAt,
        normalizedFields: { jobId, workStatus: p.job?.work_status },
        confidence,
        reversalWindowExpiresAt: eventType === "job.completed" ? graceWindowEnd(occurredAt, conn) : null,
      },
    ];
  },

  async poll(conn: Connection, sinceMs: number): Promise<RawInboundEvent[]> {
    const creds = conn.creds as HcpCreds;
    if (!creds.apiKey) return [];
    const resp = await fetch(
      `${API_BASE}/jobs?page_size=100&sort_direction=desc&sort_by=updated_at`,
      { headers: { Authorization: `Bearer ${creds.apiKey}` } },
    );
    if (!resp.ok) return [];
    const j = (await resp.json()) as { jobs?: Array<Record<string, unknown>> };
    const out: RawInboundEvent[] = [];
    for (const job of j.jobs ?? []) {
      if (toMs(job.updated_at) < sinceMs) continue;
      const synthetic: HcpEvent = {
        event: String(job.work_status).toLowerCase() === "completed" ? "job.completed" : "job.scheduled",
        id: `poll:${String(job.id)}:${String(job.updated_at)}`,
        occurred_at: String(job.updated_at ?? ""),
        job: { id: String(job.id), work_status: String(job.work_status ?? "") },
      };
      out.push({ sourceEventId: this.sourceEventId(synthetic), payload: synthetic });
    }
    return out;
  },

  async healthCheck(conn: Connection): Promise<HealthResult> {
    const creds = conn.creds as HcpCreds;
    if (!creds.apiKey) return { healthy: false, detail: "no api key" };
    try {
      const resp = await fetch(`${API_BASE}/company`, { headers: { Authorization: `Bearer ${creds.apiKey}` } });
      return resp.ok ? { healthy: true } : { healthy: false, detail: `HTTP ${resp.status}` };
    } catch (e) {
      return { healthy: false, detail: (e as Error).message };
    }
  },
};
