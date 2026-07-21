#!/usr/bin/env tsx
// Apply all pending Drizzle migrations from src/lib/db/migrations/.
// Bypasses drizzle-kit push's interactive prompt (which fails in non-TTY).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const MIGRATIONS_DIR = join(process.cwd(), "src/lib/db/migrations");

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.log("No migrations found.");
    return;
  }
  console.log(`Found ${files.length} migration(s): ${files.join(", ")}`);

  const d = db();
  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    // Each migration file may contain multiple statements separated by
    // `--> statement-breakpoint` (drizzle's convention).
    const stmts = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    console.log(`Applying ${file} (${stmts.length} statements)…`);
    for (const stmt of stmts) {
      try {
        await d.execute(sql.raw(stmt));
      } catch (e) {
        const err = e as Error & { cause?: { code?: string }; code?: string };
        const msg = err.message ?? "";
        // pg error codes for "already exists" cases:
        //   42P07 = relation/table/index already exists
        //   42710 = duplicate object (index, constraint, etc.)
        //   42701 = duplicate column
        const code = err.cause?.code ?? err.code;
        const isAlreadyExists =
          msg.includes("already exists") ||
          code === "42P07" ||
          code === "42710" ||
          code === "42701";
        if (isAlreadyExists) {
          console.log(`  (skipped — already exists)`);
          continue;
        }
        throw e;
      }
    }
    console.log(`  ✓ ${file}`);
  }
  console.log("Migrations applied.");
  process.exit(0);
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
