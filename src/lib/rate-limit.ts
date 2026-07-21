// Minimal fixed-window rate limiter, in-memory per server instance.
//
// Honest scope: on serverless (Vercel) each warm instance keeps its own
// counters, so the effective global limit is (limit × instances). That still
// stops tight loops and accidental hammering, which is the realistic threat
// at this stage. Production would back this with Upstash/Redis — the call
// sites won't change.

import { NextResponse } from "next/server";

type Bucket = { count: number; resetAtMs: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

/**
 * Returns a 429 response when the caller is over the limit, or null to
 * proceed. Usage at the top of a route handler:
 *
 *   const limited = rateLimit(req, "verify", { limit: 30, windowMs: 60_000 });
 *   if (limited) return limited;
 */
export function rateLimit(
  req: Request,
  routeName: string,
  opts: { limit: number; windowMs: number },
): NextResponse | null {
  const now = Date.now();
  const key = `${routeName}:${clientKey(req)}`;

  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) {
      if (b.resetAtMs <= now) buckets.delete(k);
    }
  }

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAtMs <= now) {
    bucket = { count: 0, resetAtMs: now + opts.windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  const remaining = Math.max(0, opts.limit - bucket.count);
  if (bucket.count > opts.limit) {
    const retryAfterS = Math.ceil((bucket.resetAtMs - now) / 1000);
    return NextResponse.json(
      { error: "rate limit exceeded", retryAfterSeconds: retryAfterS },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterS),
          "X-RateLimit-Limit": String(opts.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(bucket.resetAtMs / 1000)),
        },
      },
    );
  }
  return null;
}

/** Attach informational rate-limit headers to a successful response. */
export function rateLimitHeaders(
  req: Request,
  routeName: string,
  opts: { limit: number },
): Record<string, string> {
  const key = `${routeName}:${clientKey(req)}`;
  const bucket = buckets.get(key);
  const remaining = bucket ? Math.max(0, opts.limit - bucket.count) : opts.limit;
  return {
    "X-RateLimit-Limit": String(opts.limit),
    "X-RateLimit-Remaining": String(remaining),
  };
}
