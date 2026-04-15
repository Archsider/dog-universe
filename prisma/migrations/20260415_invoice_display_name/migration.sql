-- Migration: clientDisplayName / clientDisplayPhone sur Invoice
-- À exécuter sur Supabase SQL editor
ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "clientDisplayName" TEXT,
  ADD COLUMN IF NOT EXISTS "clientDisplayPhone" TEXT;
