-- Adds soft-delete to Notification + creates EndStayReport.
--
-- WHY soft-delete on Notification (instead of a separate audit copy) :
-- The admin needs to send a message to a client, sometimes mistakenly
-- (wrong owner, wrong content). A hard delete would lose the audit
-- trail; a separate "deletions" table doubles writes for a feature used
-- maybe twice a week. Soft-delete on the existing row is the most
-- efficient + auditable choice. The client view filters `deletedAt IS NULL`,
-- the admin reservation page keeps showing them struck-through.
--
-- WHY a dedicated EndStayReport table (instead of stuffing into
-- Notification.metadata) : the report has structured form data that we
-- want to query, edit, version, and eventually feed to an AI workflow.
-- A standalone table keeps the schema honest. The Notification row is
-- still created (so the client sees the message + email arrives via the
-- existing pipeline) but with `type = 'END_STAY_REPORT'`.
--
-- Both statements are idempotent (`IF NOT EXISTS`) so running on a stale
-- DB twice is safe.

-- ─── Notification soft-delete columns + index ────────────────────────────
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;
CREATE INDEX IF NOT EXISTS "Notification_deletedAt_idx" ON "Notification" ("deletedAt");

-- ─── EndStayReport table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EndStayReport" (
  "id"            TEXT PRIMARY KEY,
  "bookingId"     TEXT NOT NULL,
  "clientId"      TEXT NOT NULL,
  "formData"      TEXT NOT NULL,
  "finalMessage"  TEXT NOT NULL,
  "sentAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentBy"        TEXT NOT NULL,
  "version"       INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "EndStayReport_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE,
  CONSTRAINT "EndStayReport_clientId_fkey"
    FOREIGN KEY ("clientId")  REFERENCES "User"("id"),
  CONSTRAINT "EndStayReport_sentBy_fkey"
    FOREIGN KEY ("sentBy")    REFERENCES "User"("id")
);

CREATE INDEX IF NOT EXISTS "EndStayReport_bookingId_idx" ON "EndStayReport" ("bookingId");
CREATE INDEX IF NOT EXISTS "EndStayReport_clientId_idx"  ON "EndStayReport" ("clientId");
CREATE INDEX IF NOT EXISTS "EndStayReport_sentAt_idx"    ON "EndStayReport" ("sentAt");
