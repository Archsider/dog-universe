-- Migration: 20260407_vaccination_draft
-- Adds draft/AI-assisted vaccination support
-- Execute on Supabase SQL editor

-- 1. Make date nullable (required only for CONFIRMED status)
ALTER TABLE "Vaccination" ALTER COLUMN "date" DROP NOT NULL;

-- 2. Add default for vaccineType (empty string for draft entries)
ALTER TABLE "Vaccination" ALTER COLUMN "vaccineType" SET DEFAULT '';

-- 3. Add new columns
ALTER TABLE "Vaccination" ADD COLUMN IF NOT EXISTS "nextDueDate" TIMESTAMP(3);
ALTER TABLE "Vaccination" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "Vaccination" ADD COLUMN IF NOT EXISTS "isAutoDetected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vaccination" ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT;

-- 4. Index on status for efficient draft queries
CREATE INDEX IF NOT EXISTS "Vaccination_status_idx" ON "Vaccination"("status");
