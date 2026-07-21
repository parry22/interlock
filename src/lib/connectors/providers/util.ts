// Shared helpers for connector implementations: constant-time HMAC checks and
// reversal-window computation from per-connection config.

import { createHmac, timingSafeEqual } from "node:crypto";

import type { Connection } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function hmacHex(secret: string, body: string, algo: "sha256" | "sha1" = "sha256"): string {
  return createHmac(algo, secret).update(body, "utf8").digest("hex");
}

export function hmacBase64(secret: string, body: string, algo: "sha256" | "sha1" = "sha256"): string {
  return createHmac(algo, secret).update(body, "utf8").digest("base64");
}

/** Constant-time compare of two hex/base64 strings. Length-mismatch → false
 *  without leaking timing. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Retention window end (ms) for recruiting hires. Default 90 days, overridable
 *  per connection via config.retentionDays. */
export function retentionWindowEnd(occurredAtMs: number, conn: Connection, defaultDays = 90): number {
  const days = Number(conn.config?.retentionDays ?? defaultDays);
  return occurredAtMs + Math.max(0, days) * DAY_MS;
}

/** Grace window end (ms) for field-service completed jobs that aren't payment
 *  gated. Default 7 days, overridable via config.gracePeriodDays. */
export function graceWindowEnd(occurredAtMs: number, conn: Connection, defaultDays = 7): number {
  const days = Number(conn.config?.gracePeriodDays ?? defaultDays);
  return occurredAtMs + Math.max(0, days) * DAY_MS;
}

/** Parse a provider timestamp (ISO string or epoch) to epoch ms; fallback now. */
export function toMs(v: unknown): number {
  if (typeof v === "number") return v > 1e12 ? v : v * 1000; // sec vs ms heuristic
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}
