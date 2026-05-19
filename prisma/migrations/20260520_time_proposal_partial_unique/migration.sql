-- Atomic guard against concurrent createProposal calls landing two PENDING
-- rows for the same (bookingId, scope).  The TS code does updateMany→create
-- in two statements ; without this index, two admins (or admin+client)
-- racing each other can both pass the updateMany sweep (0 rows touched)
-- and both create a PENDING — leaving the UI banner in an undefined state.
--
-- Postgres partial UNIQUE index : enforces uniqueness ONLY when status is
-- PENDING, so SUPERSEDED / ACCEPTED / REJECTED / CANCELLED rows can stack
-- freely (correct — history needs many).
--
-- Source : multi-agent audit Wave 2, 2026-05-19.

CREATE UNIQUE INDEX IF NOT EXISTS "TimeProposal_one_pending_per_scope_idx"
  ON "TimeProposal" ("bookingId", "scope")
  WHERE "status" = 'PENDING';
