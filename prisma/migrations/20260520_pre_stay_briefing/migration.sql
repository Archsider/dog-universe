-- Pre-stay briefing — collected from the client 48 h before boarding.
--
-- The cron `pre-stay-briefing` (daily 10 h Casa) creates a row + emails the
-- client a link to fill 6 fields about their pet (food / toys / fears /
-- routine / vet contact / free text).  Submitted briefings are surfaced to
-- admin on the reservation detail page so the team has a perfect briefing
-- before the pet arrives.
--
-- Source : audit features 2026-05-19 (Feature #16 — Pre-stay briefing J-2).

CREATE TABLE IF NOT EXISTS "PreStayBriefing" (
  "id"          TEXT PRIMARY KEY,
  "bookingId"   TEXT NOT NULL,
  "formData"    TEXT, -- JSON blob (see src/lib/pre-stay-briefing.ts)
  "invitedAt"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "submittedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "PreStayBriefing_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE,
  -- One briefing per booking ; the cron uses ON CONFLICT to stay idempotent.
  CONSTRAINT "PreStayBriefing_bookingId_key" UNIQUE ("bookingId")
);

-- Hot path : admin reservation list highlights bookings whose briefing has
-- been submitted (badge).  And the cron looks up "not yet invited" by joining
-- on missing rows ; that's already covered by the unique index.
CREATE INDEX IF NOT EXISTS "PreStayBriefing_submittedAt_idx"
  ON "PreStayBriefing" ("submittedAt");

-- updatedAt trigger (mirror of LifetimeContract / DailyReport pattern).
CREATE OR REPLACE FUNCTION update_pre_stay_briefing_updated_at()
  RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pre_stay_briefing_set_updated_at ON "PreStayBriefing";
CREATE TRIGGER pre_stay_briefing_set_updated_at
  BEFORE UPDATE ON "PreStayBriefing"
  FOR EACH ROW EXECUTE FUNCTION update_pre_stay_briefing_updated_at();
