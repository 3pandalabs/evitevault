-- Hand-edited for idempotency, same as 0001–0006: drizzle-kit emits a bare
-- ADD COLUMN, migrations run on every container start, and a re-run of the
-- generated form would fail with "column already exists" and crash-loop the
-- API. Keep the IF NOT EXISTS.
--
-- Null on every existing row, which reads as "no card, or a card exported
-- before this column existed". Both are handled as not-stale rather than
-- stale: warning every host that a card they never made is out of date would
-- be noise, and the first re-export fills the hash in.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "card_source_hash" text;
