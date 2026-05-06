-- Add pickup GPS coordinates to TaxiTrip
-- Used to mirror coords from BoardingDetail (addons) or TaxiDetail (standalone)
-- so the admin can navigate directly from trip-level views.
ALTER TABLE "TaxiTrip"
  ADD COLUMN IF NOT EXISTS "pickupLat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "pickupLng" DOUBLE PRECISION;
