-- Free host features (2026-11-27): reminders, registry/playlist/chip-in links,
-- waitlist + approval, custom RSVP questions, co-hosts, potluck, date poll,
-- shared photo album. Every statement is idempotent (container start runs it).
-- Numbered 0015 on purpose: 0014 belongs to the cash-gifts branch (PR #88).
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "reminders_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "reminder_include_maybe" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "registry_links" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "playlist_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "chip_in" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "approval_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "waitlist_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "rsvp_questions" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "potluck_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "date_poll_status" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "date_poll_closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "album_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "album_guest_uploads" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_date_poll_status_check" CHECK ("events"."date_poll_status" is null or "events"."date_poll_status" in ('open','closed'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "answers" jsonb;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "approval_status" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "waitlist_reason" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "approval_notified_at" timestamp with time zone;--> statement-breakpoint
-- Drop + re-add is idempotent as a pair: the second run drops what the first added.
ALTER TABLE "guests" DROP CONSTRAINT IF EXISTS "guests_rsvp_status_check";--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_rsvp_status_check" CHECK ("guests"."rsvp_status" in ('pending','attending','declined','maybe','waitlisted'));--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guests" ADD CONSTRAINT "guests_approval_status_check" CHECK ("guests"."approval_status" is null or "guests"."approval_status" in ('pending','approved','declined'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_guests_reminder" ON "guests" USING btree ("event_id","reminder_sent_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_cohosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
	"invited_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"invite_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "event_cohosts_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "event_cohosts_status_check" CHECK ("event_cohosts"."status" in ('invited','accepted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_event_cohosts_email" ON "event_cohosts" USING btree ("event_id",lower("email"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_event_cohosts_user" ON "event_cohosts" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "potluck_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"note" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "potluck_items_quantity_check" CHECK ("potluck_items"."quantity" between 1 and 100)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_potluck_items_event" ON "potluck_items" USING btree ("event_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "potluck_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL REFERENCES "potluck_items"("id") ON DELETE cascade,
	"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
	"guest_id" uuid NOT NULL REFERENCES "guests"("id") ON DELETE cascade,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_potluck_claims_item_guest" UNIQUE("item_id","guest_id"),
	CONSTRAINT "potluck_claims_quantity_check" CHECK ("potluck_claims"."quantity" >= 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_potluck_claims_event" ON "potluck_claims" USING btree ("event_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "date_poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_date_poll_options_event" ON "date_poll_options" USING btree ("event_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "date_poll_votes" (
	"option_id" uuid NOT NULL REFERENCES "date_poll_options"("id") ON DELETE cascade,
	"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
	"guest_id" uuid NOT NULL REFERENCES "guests"("id") ON DELETE cascade,
	"answer" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "date_poll_votes_pk" PRIMARY KEY("option_id","guest_id"),
	CONSTRAINT "date_poll_votes_answer_check" CHECK ("date_poll_votes"."answer" in ('yes','maybe','no'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_date_poll_votes_event" ON "date_poll_votes" USING btree ("event_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "album_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE cascade,
	"image_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"guest_id" uuid REFERENCES "guests"("id") ON DELETE set null,
	"user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"uploader_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_photos_image_key_unique" UNIQUE("image_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_album_photos_event" ON "album_photos" USING btree ("event_id","created_at");
