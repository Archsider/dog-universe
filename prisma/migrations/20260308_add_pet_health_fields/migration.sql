-- AlterTable: Add health, identification and behavior fields to Pet
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "isNeutered"         BOOLEAN;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "microchipNumber"    TEXT;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "tattooNumber"       TEXT;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "weight"             DOUBLE PRECISION;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "vetName"            TEXT;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "vetPhone"           TEXT;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "allergies"          TEXT;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "currentMedication"  TEXT;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "behaviorWithDogs"   TEXT;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "behaviorWithCats"   TEXT;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "behaviorWithHumans" TEXT;
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "notes"              TEXT;
