-- Rollback the soft-delete columns + EndStayReport table. Note that DROP
-- COLUMN is destructive — any rows already soft-deleted at the time of
-- rollback would lose their `deletedAt` / `deletedBy` markers and reappear
-- in client views. That's an intentional acceptance: this rollback is meant
-- for the worst-case "the migration broke the schema" scenario, not routine
-- reversibility.

DROP INDEX IF EXISTS "EndStayReport_sentAt_idx";
DROP INDEX IF EXISTS "EndStayReport_clientId_idx";
DROP INDEX IF EXISTS "EndStayReport_bookingId_idx";
DROP TABLE IF EXISTS "EndStayReport";

DROP INDEX IF EXISTS "Notification_deletedAt_idx";
ALTER TABLE "Notification" DROP COLUMN IF EXISTS "deletedBy";
ALTER TABLE "Notification" DROP COLUMN IF EXISTS "deletedAt";
