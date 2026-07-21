CREATE TABLE IF NOT EXISTS "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_address" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"task_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"workflow_spec" jsonb DEFAULT '{"steps":[]}'::jsonb NOT NULL,
	"criteria_template" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pricing_model" text DEFAULT 'fixed' NOT NULL,
	"price_base_units" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"updated_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agents_slug_unique" ON "agents" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_owner_idx" ON "agents" ("owner_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_status_idx" ON "agents" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_agent_links" (
	"workflow_id" text PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"created_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wfal_agent_idx" ON "workflow_agent_links" ("agent_id");
