-- Hand-edited for idempotency, same as 0001–0005: drizzle-kit emits a bare
-- ADD COLUMN, migrations run on every container start, and a re-run of the
-- generated form would fail with "column already exists" and crash-loop the
-- API. Keep the IF NOT EXISTS.
--
-- The card *design* needs no migration — it lives under `theme_overrides.card`
-- in the existing jsonb column. This is only the flattened image the designer
-- exports, which is derived data and safe to drop.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "card_image_key" text;
