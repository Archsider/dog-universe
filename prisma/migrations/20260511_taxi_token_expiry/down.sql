-- Rollback for 20260511_taxi_token_expiry.
-- Drops the trackingTokenExpiresAt column on TaxiTrip. Pre-existing tokens
-- become non-expiring again (the original behaviour).
ALTER TABLE "TaxiTrip" DROP COLUMN IF EXISTS "trackingTokenExpiresAt";
