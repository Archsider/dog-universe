-- Daily Report Card — one report per (pet, day) during IN_PROGRESS boarding.
-- Cron creates DRAFTs each afternoon ; admin curates them and clicks Send to
-- trigger email + in-app notification.  WhatsApp delivery is a manual wa.me
-- link (no auto-API).
--
-- Source : audit features 2026-05-19 (Feature #3 — Daily Report Card).

CREATE TABLE IF NOT EXISTS "DailyReport" (
  "id"               TEXT PRIMARY KEY,
  "bookingId"        TEXT NOT NULL,
  "petId"            TEXT NOT NULL,
  "date"             TEXT NOT NULL,                -- 'YYYY-MM-DD' Casa
  "photoUrls"        TEXT[] NOT NULL DEFAULT '{}',
  "moodEmoji"        TEXT,
  "foodEmoji"        TEXT,
  "sleepEmoji"       TEXT,
  "playEmoji"        TEXT,
  "note"             TEXT,
  "status"           TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | SENT | SKIPPED
  "sentAt"           TIMESTAMP(3),
  "sentBy"           TEXT,
  "skipReason"       TEXT,
  "emailFailed"      BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "createdBy"        TEXT NOT NULL,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "DailyReport_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE,
  CONSTRAINT "DailyReport_petId_fkey"
    FOREIGN KEY ("petId") REFERENCES "Pet" ("id") ON DELETE CASCADE,
  -- One row per (pet, day) — the cron uses ON CONFLICT to stay idempotent.
  CONSTRAINT "DailyReport_petId_date_key" UNIQUE ("petId", "date"),
  -- Whitelist on status — defense in depth even though the app validates too.
  CONSTRAINT "DailyReport_status_check"
    CHECK ("status" IN ('DRAFT', 'SENT', 'SKIPPED'))
);

CREATE INDEX IF NOT EXISTS "DailyReport_bookingId_idx"
  ON "DailyReport" ("bookingId");

-- Hot path : admin /admin/daily-reports lists today's drafts + sent counts.
CREATE INDEX IF NOT EXISTS "DailyReport_status_date_idx"
  ON "DailyReport" ("status", "date");

CREATE INDEX IF NOT EXISTS "DailyReport_date_idx"
  ON "DailyReport" ("date");

-- updatedAt trigger — same pattern as LifetimeContract.
CREATE OR REPLACE FUNCTION update_daily_report_updated_at()
  RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS daily_report_set_updated_at ON "DailyReport";
CREATE TRIGGER daily_report_set_updated_at
  BEFORE UPDATE ON "DailyReport"
  FOR EACH ROW EXECUTE FUNCTION update_daily_report_updated_at();
