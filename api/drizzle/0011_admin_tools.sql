ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "test_as_host" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "test_owner_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "internal_label" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marked_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "video_invites" ADD COLUMN IF NOT EXISTS "test_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_test_owner_id_users_id_fk" FOREIGN KEY ("test_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_test_owner" ON "users" USING btree ("test_owner_id");