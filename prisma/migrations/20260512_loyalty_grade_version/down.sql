-- Rollback H8 — drop optimistic lock column.
ALTER TABLE "LoyaltyGrade" DROP COLUMN IF EXISTS "version";

DELETE FROM "_app_migrations" WHERE name = '20260512_loyalty_grade_version';
