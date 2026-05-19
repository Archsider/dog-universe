-- Rollback : drop the partial index then the column.
DROP INDEX IF EXISTS "Pet_isPermanentResident_idx";
ALTER TABLE "Pet" DROP COLUMN IF EXISTS "isPermanentResident";
