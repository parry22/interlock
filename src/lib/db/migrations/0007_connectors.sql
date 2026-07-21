-- Connector framework: downstream system-of-record integration.
-- Three tables: connections (encrypted creds + config), inbound_events (raw
-- landing + retry/idempotency state machine), outcome_events (canonical,
-- vertical-agnostic, with a billing lifecycle for the reversal job).

CREATE TABLE IF NOT EXISTS "connector_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "customer_id" text NOT NULL,
  "source_system" text NOT NULL,
  "display_name" text,
  "auth_kind" text NOT NULL,
  "creds_encrypted" text NOT NULL DEFAULT '',
  "webhook_secret_encrypted" text,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'active',
  "last_error" text,
  "last_healthy_at_ms" bigint,
  "poll_cursor_ms" bigint,
  "created_at_ms" bigint NOT NULL,
  "updated_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_conn_customer_idx" ON "connector_connections" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_conn_system_idx" ON "connector_connections" ("source_system");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connector_conn_status_idx" ON "connector_connections" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbound_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "connection_id" text NOT NULL,
  "source_system" text NOT NULL,
  "source_event_id" text NOT NULL,
  "raw_payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "next_retry_at_ms" bigint,
  "last_error" text,
  "received_at_ms" bigint NOT NULL,
  "processed_at_ms" bigint
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbound_events_dedupe" ON "inbound_events" ("connection_id", "source_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbound_events_status_idx" ON "inbound_events" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outcome_events" (
  "id" text PRIMARY KEY NOT NULL,
  "customer_id" text NOT NULL,
  "connector_id" text NOT NULL,
  "source_system" text NOT NULL,
  "source_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "occurred_at" bigint NOT NULL,
  "raw_payload" jsonb NOT NULL,
  "normalized_fields" jsonb NOT NULL,
  "confidence" real NOT NULL DEFAULT 1,
  "reversal_window_expires_at" bigint,
  "billing_status" text NOT NULL DEFAULT 'provisional',
  "reversed_by_event_id" text,
  "finalized_at_ms" bigint,
  "created_at_ms" bigint NOT NULL,
  "updated_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outcome_events_dedupe" ON "outcome_events" ("connector_id", "source_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_events_customer_idx" ON "outcome_events" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_events_entity_idx" ON "outcome_events" ("customer_id", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_events_reversal_idx" ON "outcome_events" ("billing_status", "reversal_window_expires_at");
