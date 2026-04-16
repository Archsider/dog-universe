-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER');

-- AlterTable InvoiceItem
ALTER TABLE "InvoiceItem"
  ADD COLUMN IF NOT EXISTS "category" "ItemCategory" NOT NULL DEFAULT 'OTHER';

-- AlterTable BookingItem
ALTER TABLE "BookingItem"
  ADD COLUMN IF NOT EXISTS "category" "ItemCategory" NOT NULL DEFAULT 'OTHER';

-- Backfill InvoiceItem — ordre obligatoire (PET_TAXI avant BOARDING)
UPDATE "InvoiceItem"
SET "category" = 'PET_TAXI'
WHERE "category" = 'OTHER'
  AND (lower("description") LIKE '%taxi%'
    OR lower("description") LIKE '%transport%'
    OR lower("description") LIKE '%animalier%');

UPDATE "InvoiceItem"
SET "category" = 'PRODUCT'
WHERE "category" = 'OTHER'
  AND (lower("description") LIKE '%croquette%'
    OR lower("description") LIKE '%kibble%');

UPDATE "InvoiceItem"
SET "category" = 'GROOMING'
WHERE "category" = 'OTHER'
  AND (lower("description") LIKE '%toilettage%'
    OR lower("description") LIKE '%bain%'
    OR lower("description") LIKE '%coupe%'
    OR lower("description") LIKE '%grooming%');

UPDATE "InvoiceItem"
SET "category" = 'BOARDING'
WHERE "category" = 'OTHER'
  AND (lower("description") LIKE '%pension%'
    OR lower("description") LIKE '%nuit%'
    OR lower("description") LIKE '%s_jour%'   -- séjour / sejour
    OR lower("description") LIKE '%boarding%'
    OR lower("description") LIKE '%chien%'
    OR lower("description") LIKE '%chat%');

-- Backfill BookingItem — même ordre
UPDATE "BookingItem"
SET "category" = 'PET_TAXI'
WHERE "category" = 'OTHER'
  AND (lower("description") LIKE '%taxi%'
    OR lower("description") LIKE '%transport%'
    OR lower("description") LIKE '%animalier%');

UPDATE "BookingItem"
SET "category" = 'PRODUCT'
WHERE "category" = 'OTHER'
  AND (lower("description") LIKE '%croquette%'
    OR lower("description") LIKE '%kibble%');

UPDATE "BookingItem"
SET "category" = 'GROOMING'
WHERE "category" = 'OTHER'
  AND (lower("description") LIKE '%toilettage%'
    OR lower("description") LIKE '%bain%'
    OR lower("description") LIKE '%coupe%'
    OR lower("description") LIKE '%grooming%');

UPDATE "BookingItem"
SET "category" = 'BOARDING'
WHERE "category" = 'OTHER'
  AND (lower("description") LIKE '%pension%'
    OR lower("description") LIKE '%nuit%'
    OR lower("description") LIKE '%s_jour%'
    OR lower("description") LIKE '%boarding%'
    OR lower("description") LIKE '%chien%'
    OR lower("description") LIKE '%chat%');
