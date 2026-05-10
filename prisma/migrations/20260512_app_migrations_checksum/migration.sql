-- Add checksum + applied_at columns to the home-grown migration tracker.
-- Idempotent : safe to re-run.
ALTER TABLE "_app_migrations" ADD COLUMN IF NOT EXISTS "checksum" TEXT;
ALTER TABLE "_app_migrations" ADD COLUMN IF NOT EXISTS "applied_at" TIMESTAMP DEFAULT NOW();
INSERT INTO "_app_migrations"(name) VALUES ('20260512_app_migrations_checksum') ON CONFLICT DO NOTHING;
