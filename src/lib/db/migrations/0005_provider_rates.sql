-- Provider rate cards: the max price a provider charges per unit of work, per
-- cost category. The verifier reconciles reported costs against these.
CREATE TABLE IF NOT EXISTS "provider_rates" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider_address" text NOT NULL,
  "category" integer NOT NULL,
  "max_per_unit_micro" bigint NOT NULL,
  "label" text,
  "updated_at_ms" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_rates_prov_cat_unique"
  ON "provider_rates" ("provider_address", "category");
