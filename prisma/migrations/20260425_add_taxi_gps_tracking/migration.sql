-- ── GPS tracking pour TaxiTrip ───────────────────────────────────────────────
-- Ajoute :
--  - 2 colonnes sur "TaxiTrip" (trackingActive + trackingToken)
--  - 1 nouvelle table "TaxiLocation" (points GPS reçus du chauffeur)
--
-- Migration appliquer manuellement sur Supabase via SQL Editor (DB locale
-- inaccessible depuis l'environnement de travail).

-- 1. Ajout des colonnes tracking sur TaxiTrip
ALTER TABLE "TaxiTrip"
  ADD COLUMN "trackingActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trackingToken"  TEXT;

-- Unicité du token (NULL autorisés, mais 2 trips ne peuvent pas partager le même token actif)
CREATE UNIQUE INDEX "TaxiTrip_trackingToken_key" ON "TaxiTrip"("trackingToken");

-- 2. Création de la table TaxiLocation
CREATE TABLE "TaxiLocation" (
  "id"         TEXT NOT NULL,
  "taxiTripId" TEXT NOT NULL,
  "latitude"   DOUBLE PRECISION NOT NULL,
  "longitude"  DOUBLE PRECISION NOT NULL,
  "heading"    DOUBLE PRECISION,
  "speed"      DOUBLE PRECISION,
  "accuracy"   DOUBLE PRECISION,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxiLocation_pkey" PRIMARY KEY ("id")
);

-- 3. Index sur taxiTripId (lookups par trip) et createdAt (timeline / "dernier point")
CREATE INDEX "TaxiLocation_taxiTripId_idx" ON "TaxiLocation"("taxiTripId");
CREATE INDEX "TaxiLocation_createdAt_idx"  ON "TaxiLocation"("createdAt");

-- 4. FK avec cascade : si un TaxiTrip est supprimé, ses points GPS aussi
ALTER TABLE "TaxiLocation"
  ADD CONSTRAINT "TaxiLocation_taxiTripId_fkey"
    FOREIGN KEY ("taxiTripId") REFERENCES "TaxiTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
