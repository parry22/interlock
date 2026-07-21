// Unit tests for the connector framework — the DB-free, correctness-critical
// units: per-provider webhook signature verification, normalization fidelity,
// and the generic reversal decision. DB-bound flows (dedupe, retry, upsert) are
// exercised at integration time against a real Postgres.
//
// Run: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { mockConnector } from "../providers/mock.ts";
import { serviceTitanConnector } from "../providers/servicetitan.ts";
import { housecallProConnector } from "../providers/housecallpro.ts";
import { greenhouseConnector } from "../providers/greenhouse.ts";
import { leverConnector } from "../providers/lever.ts";
import { bambooHrConnector } from "../providers/bamboohr.ts";
import { getConnector, listConnectors } from "../registry.ts";
import {
  selectReverser,
  isBillableType,
  isReversingType,
  CONFIRMS,
} from "../reversal.ts";

const hmacHex = (secret, body, algo = "sha256") => createHmac(algo, secret).update(body, "utf8").digest("hex");

function conn(overrides = {}) {
  return {
    id: "conn_test",
    customerId: "0xcustomer",
    sourceSystem: overrides.sourceSystem ?? "mock",
    authKind: "api_key",
    creds: {},
    webhookSecret: "s3cret",
    config: {},
    pollCursorMs: null,
    ...overrides,
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

test("registry resolves all six connectors by slug", () => {
  for (const slug of ["mock", "servicetitan", "housecallpro", "greenhouse", "lever", "bamboohr"]) {
    assert.ok(getConnector(slug), `missing connector: ${slug}`);
  }
  assert.equal(getConnector("salesforce"), undefined);
  assert.equal(listConnectors().length, 6);
});

// ─── Signature verification (security-critical) ──────────────────────────────

test("mock verifies HMAC-SHA256 over the raw body", () => {
  const body = JSON.stringify({ id: "1", type: "job.completed", entityId: "j1" });
  const good = { headers: { "x-mock-signature": hmacHex("s3cret", body) }, rawBody: body };
  const bad = { headers: { "x-mock-signature": "deadbeef" }, rawBody: body };
  assert.equal(mockConnector.verifyWebhookSignature(good, conn()), true);
  assert.equal(mockConnector.verifyWebhookSignature(bad, conn()), false);
  // Tampered body must fail even with a once-valid signature.
  assert.equal(
    mockConnector.verifyWebhookSignature({ headers: good.headers, rawBody: body + " " }, conn()),
    false,
  );
});

test("housecallpro verifies x-hcp-signature; accepts when signing disabled", () => {
  const body = JSON.stringify({ event: "job.completed", job: { id: "j1" } });
  const c = conn({ sourceSystem: "housecallpro" });
  assert.equal(
    housecallProConnector.verifyWebhookSignature({ headers: { "x-hcp-signature": hmacHex("s3cret", body) }, rawBody: body }, c),
    true,
  );
  assert.equal(
    housecallProConnector.verifyWebhookSignature({ headers: { "x-hcp-signature": "nope" }, rawBody: body }, c),
    false,
  );
  // No secret configured → accept (opt-in signing).
  assert.equal(
    housecallProConnector.verifyWebhookSignature({ headers: {}, rawBody: body }, conn({ sourceSystem: "housecallpro", webhookSecret: undefined })),
    true,
  );
});

test("greenhouse verifies the 'sha256 <hex>' Signature header", () => {
  const body = JSON.stringify({ action: "candidate_hired", payload: { application: { id: 5 } } });
  const c = conn({ sourceSystem: "greenhouse" });
  const header = `sha256 ${hmacHex("s3cret", body)}`;
  assert.equal(greenhouseConnector.verifyWebhookSignature({ headers: { signature: header }, rawBody: body }, c), true);
  assert.equal(greenhouseConnector.verifyWebhookSignature({ headers: { signature: `sha256 bad` }, rawBody: body }, c), false);
  // No secret → reject (ATS webhooks must be signed).
  assert.equal(
    greenhouseConnector.verifyWebhookSignature({ headers: { signature: header }, rawBody: body }, conn({ sourceSystem: "greenhouse", webhookSecret: undefined })),
    false,
  );
});

test("lever signs token+triggeredAt, not the body (the gotcha)", () => {
  const token = "tok_123";
  const triggeredAt = 1751800000000;
  const signature = hmacHex("s3cret", `${token}${triggeredAt}`);
  const body = JSON.stringify({ event: "candidateHired", token, triggeredAt, signature, data: { candidateId: "c1" } });
  const c = conn({ sourceSystem: "lever" });
  assert.equal(leverConnector.verifyWebhookSignature({ headers: {}, rawBody: body }, c), true);
  const badBody = JSON.stringify({ event: "candidateHired", token, triggeredAt, signature: "bad", data: {} });
  assert.equal(leverConnector.verifyWebhookSignature({ headers: {}, rawBody: badBody }, c), false);
});

test("bamboohr verifies x-bamboohr-signature", () => {
  const body = JSON.stringify({ employees: [{ id: 9, fields: { status: "Terminated" } }] });
  const c = conn({ sourceSystem: "bamboohr" });
  assert.equal(
    bambooHrConnector.verifyWebhookSignature({ headers: { "x-bamboohr-signature": hmacHex("s3cret", body) }, rawBody: body }, c),
    true,
  );
  assert.equal(
    bambooHrConnector.verifyWebhookSignature({ headers: { "x-bamboohr-signature": "no" }, rawBody: body }, c),
    false,
  );
});

// ─── Normalization fidelity ──────────────────────────────────────────────────

test("greenhouse normalizes candidate_hired → hire.started with retention window + email entityId", () => {
  const raw = {
    action: "candidate_hired",
    payload: {
      application: { id: 42, candidate_id: 7, last_activity_at: "2026-07-01T00:00:00Z" },
      candidate: { id: 7, email_addresses: [{ value: "Jane@Example.com" }] },
    },
  };
  const [ev] = greenhouseConnector.normalize(raw, conn({ sourceSystem: "greenhouse", config: { retentionDays: 90 } }));
  assert.equal(ev.eventType, "hire.started");
  assert.equal(ev.entityId, "jane@example.com"); // lowercased email = cross-connector join key
  assert.ok(ev.reversalWindowExpiresAt > ev.occurredAt);
  const days = Math.round((ev.reversalWindowExpiresAt - ev.occurredAt) / 86400000);
  assert.equal(days, 90);
});

test("bamboohr normalizes a termination → reversal event keyed on work email", () => {
  const raw = {
    employees: [{ id: 9, fields: { workEmail: "Jane@Example.com", status: "Terminated", terminationDate: "2026-08-01" } }],
  };
  const [ev] = bambooHrConnector.normalize(raw, conn({ sourceSystem: "bamboohr" }));
  assert.equal(ev.eventType, "employment.terminated");
  assert.equal(ev.entityId, "jane@example.com"); // matches the Greenhouse hire
  assert.equal(ev.isReversal, true);
});

test("housecallpro maps job.completed (grace window) and invoice.paid (matches job)", () => {
  const c = conn({ sourceSystem: "housecallpro", config: { gracePeriodDays: 7 } });
  const [completed] = housecallProConnector.normalize(
    { event: "job.completed", id: "e1", occurred_at: "2026-07-01T00:00:00Z", job: { id: "job1", work_status: "completed" } },
    c,
  );
  assert.equal(completed.eventType, "job.completed");
  assert.equal(completed.entityId, "job1");
  assert.ok(completed.reversalWindowExpiresAt > completed.occurredAt);

  const [paid] = housecallProConnector.normalize(
    { event: "invoice.paid", id: "e2", occurred_at: "2026-07-02T00:00:00Z", invoice: { id: "inv1", job_id: "job1", amount: 100 } },
    c,
  );
  assert.equal(paid.eventType, "invoice.paid");
  assert.equal(paid.entityId, "job1"); // confirms the same job
});

test("servicetitan is poll-primary and rejects unsigned webhook posts", () => {
  assert.equal(serviceTitanConnector.capabilities.supportsWebhooks, false);
  assert.deepEqual(serviceTitanConnector.capabilities.polledEventTypes.includes("job.completed"), true);
  assert.equal(
    serviceTitanConnector.verifyWebhookSignature({ headers: {}, rawBody: "{}" }, conn({ sourceSystem: "servicetitan", webhookSecret: undefined })),
    false,
  );
});

// ─── Generic reversal decision ───────────────────────────────────────────────

test("reversal classification sets", () => {
  assert.equal(isBillableType("hire.started"), true);
  assert.equal(isBillableType("job.completed"), true);
  assert.equal(isBillableType("candidate.stage_change"), false);
  assert.equal(isReversingType("employment.terminated"), true);
  assert.equal(isReversingType("invoice.refunded"), true);
  assert.deepEqual(CONFIRMS["invoice.paid"], ["job.completed"]);
});

test("selectReverser: termination inside window reverses; outside window does not", () => {
  const hire = { eventType: "hire.started", occurredAt: 1000, reversalWindowExpiresAt: 1000 + 90 * 86400000 };
  const within = { eventType: "employment.terminated", occurredAt: 1000 + 30 * 86400000, reversalWindowExpiresAt: null };
  const after = { eventType: "employment.terminated", occurredAt: 1000 + 120 * 86400000, reversalWindowExpiresAt: null };

  assert.equal(selectReverser(hire, [within]), within);
  assert.equal(selectReverser(hire, [after]), null); // terminated after retention → still billable
  assert.equal(selectReverser(hire, []), null);
  // A refund is not a reverser for a hire type check only cares about type in set,
  // but entity scoping is handled by the DB query; the predicate is type+window.
  const job = { eventType: "job.completed", occurredAt: 500, reversalWindowExpiresAt: 500 + 7 * 86400000 };
  const refund = { eventType: "invoice.refunded", occurredAt: 500 + 2 * 86400000, reversalWindowExpiresAt: null };
  assert.equal(selectReverser(job, [refund]), refund);
});

test("mock connector end-to-end normalization for a hire produces a provisional-shaped event", () => {
  const [ev] = mockConnector.normalize(
    { id: "m1", type: "hire.started", entityId: "worker@x.com", occurredAt: 1751000000000 },
    conn({ config: { retentionDays: 60 } }),
  );
  assert.equal(ev.eventType, "hire.started");
  assert.equal(Math.round((ev.reversalWindowExpiresAt - ev.occurredAt) / 86400000), 60);
});
