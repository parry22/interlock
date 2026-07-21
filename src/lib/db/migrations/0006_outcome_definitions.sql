-- Guided natural-language outcome definitions.
-- Stores BOTH the original plain-English input and the compiled structured
-- definition + executable criterion, for end-to-end auditability. The
-- verification engine only ever runs `criterion`, never the NL text.
CREATE TABLE IF NOT EXISTS "outcome_definitions" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL,
  "nl_input" text NOT NULL,
  "structured_def" jsonb NOT NULL,
  "criterion" jsonb NOT NULL,
  "criteria_hash_hex" text NOT NULL,
  "created_by_address" text,
  "status" text DEFAULT 'active' NOT NULL,
  "drift_note" text,
  "created_at_ms" bigint NOT NULL,
  "updated_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_defs_agent_idx"
  ON "outcome_definitions" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_defs_status_idx"
  ON "outcome_definitions" ("status");
