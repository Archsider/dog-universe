-- Migration: add groomingStatus to BoardingDetail
-- Run on Supabase: ALTER TABLE "BoardingDetail" ADD COLUMN IF NOT EXISTS "groomingStatus" TEXT;

ALTER TABLE "BoardingDetail" ADD COLUMN IF NOT EXISTS "groomingStatus" TEXT;
