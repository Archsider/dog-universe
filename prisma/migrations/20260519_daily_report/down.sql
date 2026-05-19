DROP TRIGGER IF EXISTS daily_report_set_updated_at ON "DailyReport";
DROP FUNCTION IF EXISTS update_daily_report_updated_at();
DROP TABLE IF EXISTS "DailyReport";
DELETE FROM "_app_migrations" WHERE name = '20260519_daily_report';
