DROP INDEX IF EXISTS "TimeProposal_one_pending_per_scope_idx";
DELETE FROM "_app_migrations" WHERE name = '20260520_time_proposal_partial_unique';
