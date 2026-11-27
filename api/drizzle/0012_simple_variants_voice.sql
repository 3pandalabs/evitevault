ALTER TABLE "video_invites" ADD COLUMN IF NOT EXISTS "variant" integer;--> statement-breakpoint
ALTER TABLE "video_invites" ADD COLUMN IF NOT EXISTS "narration" text;--> statement-breakpoint
ALTER TABLE "video_invites" ADD COLUMN IF NOT EXISTS "voice_provider" text;