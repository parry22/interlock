ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "example_outcome" jsonb DEFAULT '{}'::jsonb NOT NULL;
