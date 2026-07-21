// ServiceTitan connector (field service).
//
// Reality check that shapes this connector: ServiceTitan's public webhook
// coverage is thin and gated behind the developer portal; the dependable way to
// observe job + invoice status is POLLING the Jobs (JPM) and Accounting APIs.
// So this connector is POLL-PRIMARY. Auth is OAuth2 client-credentials, and
// every API call also needs the `ST-App-Key` header + a tenant id.
//
// Canonical entityId = the ServiceTitan job id (string). Invoice events resolve
// their job id so they match the completed-job event for reversal/confirmation.
//
// Quirks a future integrator should know:
//   • Two hostnames per env: auth-integration.servicetitan.io (token) and
//     api-integration.servicetitan.io (data) for the sandbox/integration env;
//     drop the "-integration" for production.
//   • Rate limits are per-app and return 429 + Retry-After.
//   • Poll cursor uses `modifiedOnOrAfter`; a re-poll of an unchanged record
//     dedupes because sourceEventId embeds `modifiedOn`.

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

const capabilities: ProviderCapabilities = {
  supportsWebhooks: false, // poll-primary
  webhookEventTypes: [],
  polledEventTypes: ["job.booked", "job.completed", "invoice.paid", "invoice.refunded"],
  rateLimit: { requests: 120, windowMs: 60_000 },
  authKind: "oauth",
  vertical: "field_service",
};

type StCreds = {
  clientId?: string;
  clientSecret?: string;
  appKey?: string;
  tenantId?: string;
  env?: "integration" | "production";
};

/** Our poll wrapper — records fetched from ST are boxed with their kind before
 *  entering the shared normalize path. */
type StRaw =
  | { kind: "job"; record: Record<string, unknown> }
  | { kind: "invoice"; record: Record<string, unknown> };

function hosts(env: string | undefined) {
  const seg = env === "production" ? "" : "-integration";
  return {
    auth: `https://auth${seg}.servicetitan.io/connect/token`,
    api: `https://api${seg}.servicetitan.io`,
  };
}

async function getToken(creds: StCreds): Promise<string> {
  if (!creds.clientId || !creds.clientSecret) throw new Error("servicetitan: missing client credentials");
  const { auth } = hosts(creds.env);
  const resp = await fetch(auth, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });
  if (!resp.ok) throw new Error(`servicetitan token failed: ${resp.status}`);
  const j = (await resp.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("servicetitan token response missing access_token");
  return j.access_token;
}

function stStatusToType(status: string): CanonicalOutcomeEvent["eventType"] | null {
  const s = status.toLowerCase();
  if (s === "completed") return "job.completed";
  if (s === "scheduled" || s === "booked" || s === "dispatched") return "job.booked";
  return null;
}

export const serviceTitanConnector: Connector = {
  sourceSystem: "servicetitan",
  capabilities,

  async authenticate(input: AuthInput): Promise<AuthResult> {
    const creds: StCreds = {
      clientId: input.params.clientId,
      clientSecret: input.params.clientSecret,
      appKey: input.params.appKey,
      tenantId: input.params.tenantId,
      env: (input.params.env as StCreds["env"]) ?? "integration",
    };
    try {
      await getToken(creds);
      return { ok: true, creds: creds as Record<string, unknown> };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async subscribe(): Promise<{ mode: "polling"; note: string }> {
    return { mode: "polling", note: "ServiceTitan job/invoice status is polled; no reliable public webhook." };
  },

  // If a customer does wire ST webhooks via the portal, verify an optional HMAC.
  verifyWebhookSignature(req: RawWebhookRequest, conn: Connection): boolean {
    if (!conn.webhookSecret) return false; // poll-primary: reject unsigned webhook posts
    const sig = req.headers["x-servicetitan-signature"] ?? "";
    return safeEqual(sig, hmacHex(conn.webhookSecret, req.rawBody));
  },

  sourceEventId(rawPayload: unknown): string {
    const r = rawPayload as StRaw;
    const rec = r.record ?? {};
    return `${r.kind}:${String(rec.id ?? "")}:${String(rec.modifiedOn ?? rec.modifiedOnUtc ?? "")}`;
  },

  normalize(rawPayload: unknown, conn: Connection): CanonicalOutcomeEvent[] {
    const r = rawPayload as StRaw;
    const rec = r.record ?? {};
    const occurredAt = toMs(rec.modifiedOn ?? rec.modifiedOnUtc ?? rec.completedOn);

    if (r.kind === "job") {
      const type = stStatusToType(String(rec.jobStatus ?? rec.status ?? ""));
      if (!type) return [];
      const entityId = String(rec.id ?? "");
      return [
        {
          sourceSystem: "servicetitan",
          sourceEventId: this.sourceEventId(rawPayload),
          eventType: type,
          entityId,
          occurredAt,
          normalizedFields: { jobId: entityId, status: rec.jobStatus ?? rec.status },
          confidence: 0.95, // polled snapshot, not a push event
          reversalWindowExpiresAt: type === "job.completed" ? graceWindowEnd(occurredAt, conn) : null,
        },
      ];
    }

    // invoice
    const status = String(rec.status ?? "").toLowerCase();
    const jobId = String(rec.jobId ?? (rec.job as { id?: unknown } | undefined)?.id ?? "");
    let eventType: CanonicalOutcomeEvent["eventType"] | null = null;
    if (status === "paid" || Number(rec.balance) === 0) eventType = "invoice.paid";
    else if (status === "refunded" || status === "void" || Number(rec.total) < 0) eventType = "invoice.refunded";
    if (!eventType || !jobId) return [];
    return [
      {
        sourceSystem: "servicetitan",
        sourceEventId: this.sourceEventId(rawPayload),
        eventType,
        entityId: jobId, // match the job, not the invoice
        occurredAt,
        normalizedFields: { invoiceId: rec.id, jobId, amount: rec.total, status: rec.status },
        confidence: 0.95,
      },
    ];
  },

  async poll(conn: Connection, sinceMs: number): Promise<RawInboundEvent[]> {
    const creds = conn.creds as StCreds;
    if (!creds.clientId || !creds.tenantId) return []; // not configured yet
    const token = await getToken(creds);
    const { api } = hosts(creds.env);
    const since = new Date(sinceMs).toISOString();
    const headers = { Authorization: `Bearer ${token}`, "ST-App-Key": creds.appKey ?? "" };

    const out: RawInboundEvent[] = [];
    // Jobs
    const jobsResp = await fetch(
      `${api}/jpm/v2/tenant/${creds.tenantId}/jobs?modifiedOnOrAfter=${encodeURIComponent(since)}&pageSize=200`,
      { headers },
    );
    if (jobsResp.ok) {
      const j = (await jobsResp.json()) as { data?: Record<string, unknown>[] };
      for (const record of j.data ?? []) {
        const raw = { kind: "job" as const, record };
        out.push({ sourceEventId: this.sourceEventId(raw), payload: raw });
      }
    }
    // Invoices
    const invResp = await fetch(
      `${api}/accounting/v2/tenant/${creds.tenantId}/invoices?modifiedOnOrAfter=${encodeURIComponent(since)}&pageSize=200`,
      { headers },
    );
    if (invResp.ok) {
      const j = (await invResp.json()) as { data?: Record<string, unknown>[] };
      for (const record of j.data ?? []) {
        const raw = { kind: "invoice" as const, record };
        out.push({ sourceEventId: this.sourceEventId(raw), payload: raw });
      }
    }
    return out;
  },

  async healthCheck(conn: Connection): Promise<HealthResult> {
    try {
      await getToken(conn.creds as StCreds);
      return { healthy: true };
    } catch (e) {
      return { healthy: false, detail: (e as Error).message };
    }
  },
};
