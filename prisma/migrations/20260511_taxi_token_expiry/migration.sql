-- Add hard expiry for taxi tracking tokens so a leaked SMS link cannot be
-- replayed forever. Set at start() to endTime + 6h (or now + 24h fallback).
ALTER TABLE "TaxiTrip" ADD COLUMN IF NOT EXISTS "trackingTokenExpiresAt" TIMESTAMP(3);
