-- Google OAuth replaces zkLogin: users are keyed by google_sub, not a
-- derived Sui address (we no longer derive a wallet from the JWT).
-- Wrapped in a guarded DO block (rather than plain DROP/ALTER statements)
-- because backend/scripts/db-migrate.ts only treats "already exists" errors
-- as skippable on re-run, not "does not exist" — plain DROP statements here
-- would fail on every run after the first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_google_sub_unique') THEN
    DROP INDEX "users_google_sub_unique";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'sui_address'
  ) THEN
    ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_pkey";
    ALTER TABLE "users" ADD PRIMARY KEY ("google_sub");
    ALTER TABLE "users" DROP COLUMN "sui_address";
  END IF;
END $$;
