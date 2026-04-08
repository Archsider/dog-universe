-- Migration: 20260408_invoice_partial_payment
-- Adds partial payment tracking to Invoice
-- Execute on Supabase SQL editor

-- Track how much has actually been received (0 = nothing paid yet)
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Admin-chosen payment date (independent from paidAt which is set automatically)
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentDate" TIMESTAMP(3);
