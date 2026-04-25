-- Migration: 20260409_antiparasitic_duration
-- Adds admin-overridable duration in days for anti-parasitic treatment tracking on pets.
-- Run on Supabase: ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "antiparasiticDurationDays" INTEGER;

ALTER TABLE "Pet"
  ADD COLUMN IF NOT EXISTS "antiparasiticDurationDays" INTEGER;
