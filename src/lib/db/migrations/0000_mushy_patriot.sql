CREATE TABLE "api_keys" (
	"hash" text PRIMARY KEY NOT NULL,
	"owner_address" text NOT NULL,
	"label" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"prefix" text NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"last_used_at_ms" bigint,
	"revoked_at_ms" bigint
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_address" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text,
	"payload" jsonb,
	"at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"address" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"slug" text NOT NULL,
	"notes" text,
	"created_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexed_disputes" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"outcome_id" text NOT NULL,
	"evidence_blob_id_hex" text NOT NULL,
	"filed_by" text NOT NULL,
	"timestamp_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexed_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"customer" text NOT NULL,
	"price" bigint NOT NULL,
	"pricing_model" integer NOT NULL,
	"success_criteria" jsonb,
	"success_criteria_hash_hex" text NOT NULL,
	"expires_at_ms" bigint NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"used_by_workflow_id" text
);
--> statement-breakpoint
CREATE TABLE "indexed_settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"total_settled" bigint NOT NULL,
	"platform_fee" bigint NOT NULL,
	"settled_at_ms" bigint NOT NULL,
	"splits" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexed_workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"customer" text NOT NULL,
	"product_id" text NOT NULL,
	"status" integer NOT NULL,
	"status_name" text NOT NULL,
	"quote_id" text,
	"execution_id" text,
	"outcome_id" text,
	"settlement_id" text,
	"total_revenue" bigint DEFAULT 0 NOT NULL,
	"total_cost" bigint DEFAULT 0 NOT NULL,
	"margin" bigint DEFAULT 0 NOT NULL,
	"escrow_balance" bigint DEFAULT 0 NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"updated_at_ms" bigint NOT NULL,
	"indexed_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_cursor" (
	"event_type" text PRIMARY KEY NOT NULL,
	"last_indexed_at_ms" bigint DEFAULT 0 NOT NULL,
	"last_indexed_digest" text,
	"is_healthy" boolean DEFAULT true NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"tenant_address" text PRIMARY KEY NOT NULL,
	"webhook_url" text DEFAULT '' NOT NULL,
	"signing_secret_encrypted" text DEFAULT '' NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retry_max_attempts" integer DEFAULT 5 NOT NULL,
	"retry_backoff_seconds" integer DEFAULT 30 NOT NULL,
	"updated_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"sui_address" text PRIMARY KEY NOT NULL,
	"google_sub" text NOT NULL,
	"email" text,
	"name" text,
	"picture" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_address" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at_ms" bigint,
	"delivered_at_ms" bigint,
	"last_error" text,
	"created_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "api_keys_owner_idx" ON "api_keys" USING btree ("owner_address");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_address");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at_ms");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_slug_unique" ON "customers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "disputes_workflow_idx" ON "indexed_disputes" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "disputes_timestamp_idx" ON "indexed_disputes" USING btree ("timestamp_ms");--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "indexed_quotes" USING btree ("customer");--> statement-breakpoint
CREATE INDEX "settlements_workflow_idx" ON "indexed_settlements" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "settlements_settled_at_idx" ON "indexed_settlements" USING btree ("settled_at_ms");--> statement-breakpoint
CREATE INDEX "workflows_customer_idx" ON "indexed_workflows" USING btree ("customer");--> statement-breakpoint
CREATE INDEX "workflows_status_idx" ON "indexed_workflows" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflows_product_idx" ON "indexed_workflows" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_unique" ON "users" USING btree ("google_sub");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_tenant_idx" ON "webhook_deliveries" USING btree ("tenant_address");