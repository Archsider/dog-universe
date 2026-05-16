-- TimeProposal — booking lifecycle time confirmation entity.
-- @rollback: see down.sql
-- @safety: reviewed — adds new enums + new table + retro-fills existing
-- bookings with an ACCEPTED proposal to avoid an "orange banner spam" on
-- the admin reservation page after deploy. Idempotent (re-runnable).

BEGIN;

-- ── Enums ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "TimeProposalScope" AS ENUM ('ARRIVAL', 'TAXI_GO', 'TAXI_RETURN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TimeProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TimeProposal" (
  "id"                   TEXT                  PRIMARY KEY,
  "bookingId"            TEXT                  NOT NULL,
  "scope"                "TimeProposalScope"   NOT NULL,
  "time"                 TEXT                  NOT NULL,
  "status"               "TimeProposalStatus"  NOT NULL DEFAULT 'PENDING',
  "proposedBy"           TEXT                  NOT NULL,
  "proposedByRole"       TEXT                  NOT NULL,
  "proposedAt"           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  "proposalNote"         TEXT,
  "respondedBy"          TEXT,
  "respondedByRole"      TEXT,
  "respondedAt"          TIMESTAMPTZ,
  "responseNote"         TEXT,
  "publicToken"          TEXT                  UNIQUE,
  "publicTokenExpiresAt" TIMESTAMPTZ,
  "createdAt"            TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  "updatedAt"            TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  CONSTRAINT "TimeProposal_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE
);

-- Hot path indexes
CREATE INDEX IF NOT EXISTS "TimeProposal_bookingId_scope_idx"
  ON "TimeProposal" ("bookingId", "scope");
CREATE INDEX IF NOT EXISTS "TimeProposal_bookingId_scope_status_idx"
  ON "TimeProposal" ("bookingId", "scope", "status");
CREATE INDEX IF NOT EXISTS "TimeProposal_status_idx"
  ON "TimeProposal" ("status");
CREATE INDEX IF NOT EXISTS "TimeProposal_publicToken_idx"
  ON "TimeProposal" ("publicToken");

-- updatedAt auto-touch trigger (project convention — see other models)
CREATE OR REPLACE FUNCTION trg_time_proposal_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN
  NEW."updatedAt" := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_time_proposal_updated_at ON "TimeProposal";
CREATE TRIGGER trg_time_proposal_updated_at
  BEFORE UPDATE ON "TimeProposal"
  FOR EACH ROW EXECUTE FUNCTION trg_time_proposal_set_updated_at();

-- ── Retro-migration ─────────────────────────────────────────────────────
-- Backfill existing bookings as ACCEPTED proposals so the admin /admin/
-- reservations page doesn't spam orange "time not confirmed" banners on
-- legacy data. Only stamps rows that have a non-null time value.

-- 1. ARRIVAL : Booking.arrivalTime
INSERT INTO "TimeProposal"
  (id, "bookingId", scope, time, status, "proposedBy", "proposedByRole",
   "proposedAt", "respondedBy", "respondedByRole", "respondedAt", "responseNote")
SELECT
  'tp_legacy_arr_' || b.id,
  b.id,
  'ARRIVAL',
  b."arrivalTime",
  'ACCEPTED',
  b."clientId",
  'CLIENT',
  b."createdAt",
  b."clientId",
  'CLIENT',
  b."createdAt",
  'Retro-migration: pre-2026-05-17 booking — time considered confirmed by legacy convention.'
FROM "Booking" b
WHERE b."arrivalTime" IS NOT NULL
  AND b."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TimeProposal" tp WHERE tp."bookingId" = b.id AND tp.scope = 'ARRIVAL'
  );

-- 2. TAXI_GO : BoardingDetail.taxiGoTime (only where taxiGoEnabled=true)
INSERT INTO "TimeProposal"
  (id, "bookingId", scope, time, status, "proposedBy", "proposedByRole",
   "proposedAt", "respondedBy", "respondedByRole", "respondedAt", "responseNote")
SELECT
  'tp_legacy_txgo_' || bd."bookingId",
  bd."bookingId",
  'TAXI_GO',
  bd."taxiGoTime",
  'ACCEPTED',
  b."clientId",
  'CLIENT',
  b."createdAt",
  b."clientId",
  'CLIENT',
  b."createdAt",
  'Retro-migration: pre-2026-05-17 taxi-go addon — time considered confirmed by legacy convention.'
FROM "BoardingDetail" bd
JOIN "Booking" b ON b.id = bd."bookingId"
WHERE bd."taxiGoEnabled" = true
  AND bd."taxiGoTime" IS NOT NULL
  AND b."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TimeProposal" tp WHERE tp."bookingId" = bd."bookingId" AND tp.scope = 'TAXI_GO'
  );

-- 3. TAXI_RETURN : BoardingDetail.taxiReturnTime
INSERT INTO "TimeProposal"
  (id, "bookingId", scope, time, status, "proposedBy", "proposedByRole",
   "proposedAt", "respondedBy", "respondedByRole", "respondedAt", "responseNote")
SELECT
  'tp_legacy_txret_' || bd."bookingId",
  bd."bookingId",
  'TAXI_RETURN',
  bd."taxiReturnTime",
  'ACCEPTED',
  b."clientId",
  'CLIENT',
  b."createdAt",
  b."clientId",
  'CLIENT',
  b."createdAt",
  'Retro-migration: pre-2026-05-17 taxi-return addon — time considered confirmed by legacy convention.'
FROM "BoardingDetail" bd
JOIN "Booking" b ON b.id = bd."bookingId"
WHERE bd."taxiReturnEnabled" = true
  AND bd."taxiReturnTime" IS NOT NULL
  AND b."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TimeProposal" tp WHERE tp."bookingId" = bd."bookingId" AND tp.scope = 'TAXI_RETURN'
  );

INSERT INTO "_app_migrations"(name)
VALUES ('20260517_time_proposals')
ON CONFLICT (name) DO NOTHING;

COMMIT;
