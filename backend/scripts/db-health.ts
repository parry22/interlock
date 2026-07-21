#!/usr/bin/env tsx
// Smoke-test the Postgres connection.

import { checkDbConnection } from "@/lib/db";

async function main() {
  const r = await checkDbConnection();
  console.log(r);
  process.exit(r.ok ? 0 : 1);
}
main();
