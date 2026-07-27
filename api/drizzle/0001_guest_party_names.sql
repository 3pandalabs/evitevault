-- Hand-edited for idempotency. drizzle-kit emits a bare
-- `ALTER TABLE "guests" ADD COLUMN "plus_one_names" jsonb;`, which fails with
-- "column already exists" on a second run — and migrations run on every
-- container start (see ../Dockerfile), so that would crash-loop the API and
-- take production down. This is the exact failure that hit RentVault on
-- 2026-07-24. Keep the IF NOT EXISTS.
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "plus_one_names" jsonb;
