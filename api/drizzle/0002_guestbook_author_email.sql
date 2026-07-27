-- Hand-edited for idempotency, same as 0001: drizzle-kit emits a bare
-- ADD COLUMN, migrations run on every container start, and a re-run of the
-- generated form would fail with "column already exists" and crash-loop the
-- API. Keep the IF NOT EXISTS.
ALTER TABLE "guestbook_posts" ADD COLUMN IF NOT EXISTS "author_email" text;
