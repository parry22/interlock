-- Per-user custodial wallets (Avalanche Fuji). Privkey is AES-256-GCM
-- encrypted with SETTINGS_ENCRYPTION_KEY before insert; never stored plain.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wallet_address" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wallet_privkey_encrypted" text;
