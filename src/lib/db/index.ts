// Postgres client singleton. Imports schema for type-safe queries.
//
// We use `pg`'s connection pool (rather than the @neondatabase/serverless
// HTTP client) so the same code works against any Postgres in local dev.
// Neon's pooled connection string handles serverless-style fan-out.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Create a Neon Postgres database and paste the pooled connection string into .env.local.",
    );
  }
  _pool = new Pool({
    connectionString: url,
    // Neon's pooler likes a small max — serverless functions reconnect cheaply.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return _pool;
}

/** Lazy Drizzle client. First call opens the pool; subsequent calls reuse it. */
export function db() {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema });
  return _db;
}

/** Re-export the schema namespace for queries (`s.users`, `s.customers`, etc.). */
export { schema };
export * from "./schema";

/** Test the connection — used by /api/db/health for diagnostics. */
export async function checkDbConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const t0 = Date.now();
  try {
    const client = await getPool().connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** True if DATABASE_URL is set; false otherwise (used by routes to fall back to KV). */
export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
