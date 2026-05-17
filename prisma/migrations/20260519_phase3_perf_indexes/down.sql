-- Rollback for 20260519_phase3_perf_indexes.
-- No indexes were created by the up migration (all already existed).
-- Only removes the _app_migrations record.

DELETE FROM "_app_migrations" WHERE name = '20260519_phase3_perf_indexes';
