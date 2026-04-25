-- Migration: 20260409_historical_client_data
-- Adds historical baseline fields to User for pre-existing clients before the app.
-- historicalStays and historicalSpendMAD are included in loyalty grade calculation.
-- Run on Supabase:

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "historicalStays"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "historicalSpendMAD" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "historicalNote"     TEXT;
