-- Migration: lifetime boarding contract digital signature flow
--
-- Spec : Stephanie Yanik / Mama (2026-05-18).  Admin generates an HMAC-signed
-- shareable link, the client opens it on their phone, signs with a finger,
-- and the signed PDF is generated + stored privately.
--
-- The existing ClientContract table covers the *generic onboarding contract*
-- (one per client, kicks in at portal first-login).  Lifetime contracts are
-- pet-specific and admin-initiated, so they live in their own table.
--
-- Idempotent : the DO/EXISTS blocks make this safe to re-run.

DO $$ BEGIN
  CREATE TYPE "LifetimeContractStatus" AS ENUM ('PENDING','SIGNED','EXPIRED','REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "LifetimeContract" (
  "id"                   TEXT PRIMARY KEY,
  "clientId"             TEXT NOT NULL,
  "petId"                TEXT NOT NULL,
  "status"               "LifetimeContractStatus" NOT NULL DEFAULT 'PENDING',

  -- HMAC-signed shareable link.  Cleared on terminal status as
  -- defence-in-depth (the route returns 410 Gone if missing).
  "publicToken"          TEXT,
  "publicTokenExpiresAt" TIMESTAMP(3),

  -- Populated on signature.
  "signedAt"             TIMESTAMP(3),
  "storageKey"           TEXT,
  "ipAddress"            TEXT,
  "userAgent"            TEXT,

  "version"              TEXT NOT NULL DEFAULT '1.0',
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "createdBy"            TEXT NOT NULL,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "LifetimeContract_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "LifetimeContract_petId_fkey"
    FOREIGN KEY ("petId") REFERENCES "Pet" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "LifetimeContract_publicToken_key"
  ON "LifetimeContract" ("publicToken");

CREATE INDEX IF NOT EXISTS "LifetimeContract_clientId_idx"
  ON "LifetimeContract" ("clientId");

CREATE INDEX IF NOT EXISTS "LifetimeContract_petId_idx"
  ON "LifetimeContract" ("petId");

CREATE INDEX IF NOT EXISTS "LifetimeContract_status_idx"
  ON "LifetimeContract" ("status");

-- updatedAt trigger
CREATE OR REPLACE FUNCTION update_lifetime_contract_updated_at()
  RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lifetime_contract_set_updated_at ON "LifetimeContract";
CREATE TRIGGER lifetime_contract_set_updated_at
  BEFORE UPDATE ON "LifetimeContract"
  FOR EACH ROW EXECUTE FUNCTION update_lifetime_contract_updated_at();
