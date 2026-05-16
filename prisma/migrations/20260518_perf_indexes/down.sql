-- Rollback for 20260518_perf_indexes.
-- Drops the 4 hot-path indexes added by migration.sql. Safe: no data loss,
-- queries fall back to existing indexes (slower but functional).

BEGIN;

DROP INDEX IF EXISTS "Booking_capacity_partial_idx";
DROP INDEX IF EXISTS "Vaccination_nextDueDate_confirmed_idx";
DROP INDEX IF EXISTS "ActionLog_entity_createdAt_idx";
DROP INDEX IF EXISTS "Notification_user_type_date_idx";

DELETE FROM "_app_migrations" WHERE name = '20260518_perf_indexes';

COMMIT;
