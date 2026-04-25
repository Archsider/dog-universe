-- Migration: isWalkIn sur User
-- À exécuter sur Supabase SQL editor (après 20260415_invoice_display_name)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isWalkIn" BOOLEAN NOT NULL DEFAULT false;
