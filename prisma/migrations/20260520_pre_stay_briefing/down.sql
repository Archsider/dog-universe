DROP TRIGGER IF EXISTS pre_stay_briefing_set_updated_at ON "PreStayBriefing";
DROP FUNCTION IF EXISTS update_pre_stay_briefing_updated_at();
DROP TABLE IF EXISTS "PreStayBriefing";
DELETE FROM "_app_migrations" WHERE name = '20260520_pre_stay_briefing';
