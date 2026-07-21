// BambooHR connector (recruiting HRIS).
//
// This is the RETENTION-REVERSAL source: it emits `employment.terminated`, which
// the generic reversal engine uses to void a still-provisional `hire.started`
// (from Greenhouse/Lever) for the same person within the retention window. The
// join key is the work email (lowercased) = the ATS candidate email.
//
// WEBHOOK-PRIMARY (BambooHR field-change webhooks) with a polling fallback over
// the "changed employees" API. Auth is HTTP Basic with the API key as username
// and any password; all calls are subdomain-scoped.
//
// Quirks a future integrator must know:
//   • The webhook only includes the fields the customer configured it to
//     monitor — you MUST monitor workEmail + status + terminationDate, or the
//     cross-connector email join (and thus reversal) can't happen.
//   • Signature: HMAC-SHA256 of the raw body in `x-bamboohr-signature` when a
//     private key is set. Strongly recommended in production.

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
import { hmacHex, safeEqual, toMs } from "./util";

const capabilities: ProviderCapabilities = {
  supportsWebhooks: true,
  webhookEventTypes: ["employment.terminated"],
  polledEventTypes: [], // webhook-primary; poll() is the fallback
  rateLimit: { requests: 60, windowMs: 60_000 },
  authKind: "api_key",
  vertical: "recruiting",
};

type BambooCreds = { apiKey?: string; subdomain?: string };

type BambooEmployee = {
  id?: string | number;
  fields?: Record<string, unknown>;
};
type BambooWebhook = { employees?: BambooEmployee[] };

function base(subdomain: string): string {
  return `https://api.bamboohr.com/api/gateway.php/${subdomain}/v1`;
}

function isTerminated(fields: Record<string, unknown>): boolean {
  const status = String(fields.status ?? fields.employmentHistoryStatus ?? "").toLowerCase();
  if (status.includes("terminated") || status.includes("inactive")) return true;
  return Boolean(fields.terminationDate);
}

function email(fields: Record<string, unknown>): string {
  return String(fields.workEmail ?? fields.homeEmail ?? "").toLowerCase();
}

export const bambooHrConnector: Connector = {
  sourceSystem: "bamboohr",
  capabilities,

  async authenticate(input: AuthInput): Promise<AuthResult> {
    const apiKey = input.params.apiKey;
    const subdomain = input.params.subdomain;
    if (!apiKey || !subdomain) return { ok: false, error: "bamboohr: apiKey and subdomain required" };
    try {
      const auth = Buffer.from(`${apiKey}:x`).toString("base64");
      const resp = await fetch(`${base(subdomain)}/employees/directory`, {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      });
      if (!resp.ok) return { ok: false, error: `bamboohr auth failed: ${resp.status}` };
      return { ok: true, creds: { apiKey, subdomain } };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async subscribe(): Promise<{ mode: "webhook"; registered: boolean; note: string }> {
    return {
      mode: "webhook",
      registered: false,
      note: "Create a BambooHR webhook monitoring status + terminationDate + workEmail → /api/connectors/bamboohr/webhook.",
    };
  },

  verifyWebhookSignature(req: RawWebhookRequest, conn: Connection): boolean {
    if (!conn.webhookSecret) return true; // accept when no private key set (dev)
    const sig = req.headers["x-bamboohr-signature"] ?? "";
    return safeEqual(sig, hmacHex(conn.webhookSecret, req.rawBody));
  },

  sourceEventId(rawPayload: unknown): string {
    const w = rawPayload as BambooWebhook;
    const first = w.employees?.[0];
    const f = first?.fields ?? {};
    return `term:${first?.id ?? ""}:${String(f.terminationDate ?? f.status ?? "")}`;
  },

  normalize(rawPayload: unknown): CanonicalOutcomeEvent[] {
    const w = rawPayload as BambooWebhook;
    const out: CanonicalOutcomeEvent[] = [];
    for (const emp of w.employees ?? []) {
      const fields = emp.fields ?? {};
      if (!isTerminated(fields)) continue;
      const mail = email(fields);
      if (!mail) continue; // no join key → can't reverse; skip (see quirks)
      const occurredAt = toMs(fields.terminationDate);
      out.push({
        sourceSystem: "bamboohr",
        sourceEventId: `term:${emp.id ?? ""}:${String(fields.terminationDate ?? fields.status ?? "")}`,
        eventType: "employment.terminated",
        entityId: mail, // matches the ATS hire email
        occurredAt,
        normalizedFields: { employeeId: emp.id, email: mail, terminationDate: fields.terminationDate, status: fields.status },
        confidence: 1,
        isReversal: true,
      });
    }
    return out;
  },

  async poll(conn: Connection, sinceMs: number): Promise<RawInboundEvent[]> {
    const creds = conn.creds as BambooCreds;
    if (!creds.apiKey || !creds.subdomain) return [];
    const auth = Buffer.from(`${creds.apiKey}:x`).toString("base64");
    const since = new Date(sinceMs).toISOString().slice(0, 19).replace("T", " ");
    const resp = await fetch(`${base(creds.subdomain)}/employees/changed?since=${encodeURIComponent(since)}&type=updated`, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
    if (!resp.ok) return [];
    const j = (await resp.json()) as { employees?: Record<string, { id?: string }> };
    const out: RawInboundEvent[] = [];
    // For each changed employee, fetch the fields we care about.
    for (const id of Object.keys(j.employees ?? {})) {
      const detail = await fetch(
        `${base(creds.subdomain)}/employees/${id}?fields=workEmail,status,terminationDate`,
        { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } },
      );
      if (!detail.ok) continue;
      const fields = (await detail.json()) as Record<string, unknown>;
      const raw: BambooWebhook = { employees: [{ id, fields }] };
      if (isTerminated(fields) && email(fields)) {
        out.push({ sourceEventId: this.sourceEventId(raw), payload: raw });
      }
    }
    return out;
  },

  async healthCheck(conn: Connection): Promise<HealthResult> {
    const creds = conn.creds as BambooCreds;
    if (!creds.apiKey || !creds.subdomain) return { healthy: false, detail: "missing apiKey/subdomain" };
    try {
      const auth = Buffer.from(`${creds.apiKey}:x`).toString("base64");
      const resp = await fetch(`${base(creds.subdomain)}/employees/directory`, {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      });
      return resp.ok ? { healthy: true } : { healthy: false, detail: `HTTP ${resp.status}` };
    } catch (e) {
      return { healthy: false, detail: (e as Error).message };
    }
  },
};
