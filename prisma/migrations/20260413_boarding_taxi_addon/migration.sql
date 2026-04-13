-- Migration: Add pet taxi addon columns to BoardingDetail
-- These columns store the taxi go/return addon options for BOARDING reservations.
-- Run on Supabase via the SQL editor.

ALTER TABLE "BoardingDetail"
  ADD COLUMN IF NOT EXISTS "taxiGoEnabled"     BOOLEAN          NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "taxiGoDate"        TEXT,
  ADD COLUMN IF NOT EXISTS "taxiGoTime"        TEXT,
  ADD COLUMN IF NOT EXISTS "taxiGoAddress"     TEXT,
  ADD COLUMN IF NOT EXISTS "taxiReturnEnabled" BOOLEAN          NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "taxiReturnDate"    TEXT,
  ADD COLUMN IF NOT EXISTS "taxiReturnTime"    TEXT,
  ADD COLUMN IF NOT EXISTS "taxiReturnAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "taxiAddonPrice"    DOUBLE PRECISION NOT NULL DEFAULT 0;
