CREATE TABLE IF NOT EXISTS "gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"guest_name" text,
	"guest_message" text,
	"amount_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"card_fee_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"destination_account" text NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent" text,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"disputed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gifts_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "gifts_status_check" CHECK ("gifts"."status" in ('pending','paid','expired','refunded','disputed','dispute_lost')),
	CONSTRAINT "gifts_amount_check" CHECK ("gifts"."amount_cents" > 0 and "gifts"."total_cents" >= "gifts"."amount_cents")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "gifts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "gift_suggested_cents" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "gift_message" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_account_status" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_test_account_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_test_account_status" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gifts" ADD CONSTRAINT "gifts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gifts" ADD CONSTRAINT "gifts_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gifts_event" ON "gifts" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gifts_payment_intent" ON "gifts" USING btree ("stripe_payment_intent");