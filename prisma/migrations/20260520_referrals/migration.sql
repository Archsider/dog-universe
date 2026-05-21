-- Parrainage Royal — Wave 9 feature #7.
--
-- Lien de parrainage HMAC-signé, statut suivi de PENDING → SIGNED_UP →
-- REWARDED (au 1er séjour COMPLETED du filleul). Badge "Ambassadeur Or"
-- débloqué à 3+ parrainages SIGNED_UP.
--
-- Le token est signé par NEXTAUTH_SECRET (cf src/lib/referral-token.ts) ;
-- il ne nécessite aucune row DB pour être généré. Une row Referral est
-- créée seulement quand le filleul s'inscrit via le lien (status=SIGNED_UP)
-- ou que le parrain veut tracer un envoi explicite (PENDING).

CREATE TABLE IF NOT EXISTS "Referral" (
  "id"           TEXT PRIMARY KEY,
  "sponsorId"    TEXT NOT NULL,
  "refereeId"    TEXT,
  "refereeEmail" TEXT,
  "status"       TEXT NOT NULL DEFAULT 'SIGNED_UP',
  "signedUpAt"   TIMESTAMP(3),
  "rewardedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "Referral_status_check"
    CHECK ("status" IN ('PENDING', 'SIGNED_UP', 'REWARDED', 'EXPIRED')),

  CONSTRAINT "Referral_sponsorId_fkey"
    FOREIGN KEY ("sponsorId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "Referral_refereeId_fkey"
    FOREIGN KEY ("refereeId") REFERENCES "User" ("id") ON DELETE SET NULL,

  -- One row per (sponsor, referee) pair — a friend can be sponsored at
  -- most once.  refereeId is nullable so the PENDING state (sponsor sent
  -- the link but friend not yet signed up) can coexist.
  CONSTRAINT "Referral_sponsor_referee_unique"
    UNIQUE NULLS NOT DISTINCT ("sponsorId", "refereeId")
);

CREATE INDEX IF NOT EXISTS "Referral_sponsorId_status_idx"
  ON "Referral" ("sponsorId", "status");

CREATE INDEX IF NOT EXISTS "Referral_refereeId_idx"
  ON "Referral" ("refereeId");

-- @rollback: see down.sql
