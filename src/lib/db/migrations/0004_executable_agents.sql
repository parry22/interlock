-- Executable agents: an agent can declare an HTTPS endpoint the platform calls
-- to run its real code, and settles against its own on-chain product (so the
-- owner gets paid). Both nullable — a declared-only agent keeps working.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "execution_endpoint" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "onchain_product_id" integer;
