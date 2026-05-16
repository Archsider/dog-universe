-- Rollback for 20260517_revenue_mv_semantic_b — restore Sémantique A MV.
-- Idempotent. Restores from the archive renamed in the up migration.

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_mv;

-- Restore archive if it still exists (rollback within 30j window)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews WHERE matviewname = 'monthly_revenue_mv_v1_archive_20260517'
  ) THEN
    EXECUTE 'ALTER MATERIALIZED VIEW monthly_revenue_mv_v1_archive_20260517 RENAME TO monthly_revenue_mv';
  END IF;
END $$;

DROP FUNCTION IF EXISTS compute_payment_by_category(INT, INT);

DELETE FROM "_app_migrations" WHERE name = '20260517_revenue_mv_semantic_b';

COMMIT;
