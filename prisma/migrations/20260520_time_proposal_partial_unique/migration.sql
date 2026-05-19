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

-- STEP 1 — Deduplicate any duplicate PENDING rows the race may have
-- produced in production BEFORE creating the unique index (otherwise the
-- CREATE UNIQUE INDEX would fail and block the deploy).  For each
-- (bookingId, scope) group of PENDING rows, keep the most recent one
-- and SUPERSEDE the older ones.  Idempotent : if no duplicates exist
-- the UPDATE simply touches 0 rows.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "bookingId", "scope"
      ORDER BY "proposedAt" DESC, id DESC
    ) AS rn
  FROM "TimeProposal"
  WHERE "status" = 'PENDING'
)
UPDATE "TimeProposal" tp
SET    "status" = 'SUPERSEDED',
       "publicToken" = NULL,
       "publicTokenExpiresAt" = NULL,
       "respondedAt" = NOW(),
       "respondedByRole" = 'ADMIN',
       "responseNote" = '[Auto-superseded 2026-05-20] Duplicate PENDING resolved during partial-unique index migration.'
FROM   ranked
WHERE  tp.id = ranked.id
  AND  ranked.rn > 1;

-- STEP 2 — Create the partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "TimeProposal_one_pending_per_scope_idx"
  ON "TimeProposal" ("bookingId", "scope")
  WHERE "status" = 'PENDING';
