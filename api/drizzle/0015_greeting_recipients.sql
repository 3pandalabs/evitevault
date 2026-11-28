ALTER TABLE "greetings" ADD COLUMN IF NOT EXISTS "sent_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL;
