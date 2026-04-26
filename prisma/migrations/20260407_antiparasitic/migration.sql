-- Migration: 20260407_antiparasitic
-- Adds anti-parasitic treatment tracking to Pet profile
-- Execute on Supabase SQL editor

ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "lastAntiparasiticDate" TIMESTAMP(3);
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "antiparasiticProduct" TEXT;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "antiparasiticNotes" TEXT;
