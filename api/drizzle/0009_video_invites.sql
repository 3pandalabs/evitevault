CREATE TABLE IF NOT EXISTS "video_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"tier" text NOT NULL,
	"occasion" text NOT NULL,
	"script" text NOT NULL,
	"photo_key" text,
	"attested_at" timestamp with time zone,
	"attestation_text" text,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent" text,
	"paid_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"video_key" text,
	"provider" text,
	"error" text,
	"refund_needed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_invites_stripe_session_id_unique" UNIQUE("stripe_session_id"),
	CONSTRAINT "video_invites_tier_check" CHECK ("video_invites"."tier" in ('simple','pro')),
	CONSTRAINT "video_invites_status_check" CHECK ("video_invites"."status" in ('pending_payment','paid','generating','ready','failed','refunded','cancelled')),
	CONSTRAINT "video_invites_pro_photo_check" CHECK ("video_invites"."tier" <> 'pro' or ("video_invites"."photo_key" is not null and "video_invites"."attested_at" is not null))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_invites" ADD CONSTRAINT "video_invites_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_invites" ADD CONSTRAINT "video_invites_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_video_invites_event" ON "video_invites" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_video_invites_status" ON "video_invites" USING btree ("status");