-- Add storageKey to PetDocument
-- Stores the private bucket key so signed URLs can be regenerated on demand
-- (signed URLs expire after 1 hour; fileUrl stored at upload time becomes stale)
ALTER TABLE "PetDocument" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
