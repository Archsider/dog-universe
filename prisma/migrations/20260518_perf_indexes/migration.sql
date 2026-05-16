-- @safety: reviewed — 4 indexes hot path identified by perf audit (dashboard,
-- slide-over, cron dedup). All CREATE INDEX IF NOT EXISTS, idempotent.
-- @rollback: see down.sql
--
-- Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction and the
-- db-migrate.mjs runner wraps everything in BEGIN/COMMIT. We deliberately
-- accept a brief ACCESS EXCLUSIVE lock on the targeted tables (Booking,
-- Vaccination, ActionLog, Notification) — all small-to-medium in row count
-- (<100k rows in prod at time of writing) — expected <1s lock per index.

BEGIN;

-- Dashboard "Pension actuelle" + capacity overlap (Booking_capacity_partial):
-- partial index covers the common WHERE used by getCapacityLimits /
-- overlap queries (status IN active set, isOpenEnded=false, not deleted).
CREATE INDEX IF NOT EXISTS "Booking_capacity_partial_idx"
  ON "Booking"("status", "startDate", "endDate")
  WHERE "isOpenEnded" = false AND "deletedAt" IS NULL;

-- Dashboard "Vaccins à renouveler" widget: WHERE status='CONFIRMED' AND
-- nextDueDate BETWEEN today AND today+30. Partial index keeps it tiny.
CREATE INDEX IF NOT EXISTS "Vaccination_nextDueDate_confirmed_idx"
  ON "Vaccination"("nextDueDate")
  WHERE "status" = 'CONFIRMED';

-- Slide-over panel History section: ActionLog filtered per entity (booking,
-- invoice, pet), ordered DESC by createdAt.
CREATE INDEX IF NOT EXISTS "ActionLog_entity_createdAt_idx"
  ON "ActionLog"("entityType", "entityId", "createdAt" DESC);

-- Cron dedup queries (reminders, birthday, contract-reminders, overdue,
-- review-requests): WHERE userId=? AND type=? AND createdAt >= window.
CREATE INDEX IF NOT EXISTS "Notification_user_type_date_idx"
  ON "Notification"("userId", "type", "createdAt" DESC);

INSERT INTO "_app_migrations" (name) VALUES ('20260518_perf_indexes')
  ON CONFLICT (name) DO NOTHING;

COMMIT;
