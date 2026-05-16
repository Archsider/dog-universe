-- Rollback 20260518_data_integrity_hardening — supprime les 4 CHECK constraints.

BEGIN;

ALTER TABLE "Review"       DROP CONSTRAINT IF EXISTS "Review_rating_range";
ALTER TABLE "Payment"      DROP CONSTRAINT IF EXISTS "Payment_amount_nonzero";
ALTER TABLE "TimeProposal" DROP CONSTRAINT IF EXISTS "TimeProposal_proposedByRole_enum";
ALTER TABLE "TimeProposal" DROP CONSTRAINT IF EXISTS "TimeProposal_respondedByRole_enum";

DELETE FROM "_app_migrations" WHERE name = '20260518_data_integrity_hardening';

COMMIT;
