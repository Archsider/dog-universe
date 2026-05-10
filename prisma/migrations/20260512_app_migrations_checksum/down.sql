-- Rollback for 20260512_app_migrations_checksum.
-- Drops the checksum + applied_at columns added on the migration tracker.
-- The tracker row itself is removed by the rollback runner.
ALTER TABLE "_app_migrations" DROP COLUMN IF EXISTS "checksum";
ALTER TABLE "_app_migrations" DROP COLUMN IF EXISTS "applied_at";
