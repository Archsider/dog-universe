-- Rollback for 20260517_time_proposals.
-- Drops the TimeProposal table (cascade deletes all backfilled rows) and
-- the two enums. Irreversible on data — the backfill is regenerated from
-- the source columns (Booking.arrivalTime, BoardingDetail.taxiGo/ReturnTime)
-- on re-up.

BEGIN;

DROP TRIGGER IF EXISTS trg_time_proposal_updated_at ON "TimeProposal";
DROP FUNCTION IF EXISTS trg_time_proposal_set_updated_at();

DROP TABLE IF EXISTS "TimeProposal";

DROP TYPE IF EXISTS "TimeProposalStatus";
DROP TYPE IF EXISTS "TimeProposalScope";

DELETE FROM "_app_migrations" WHERE name = '20260517_time_proposals';

COMMIT;
