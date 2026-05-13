-- Reverse of 20260513_product_catalog_fields.
BEGIN;

DROP INDEX IF EXISTS "Product_isArchived_idx";

ALTER TABLE "Product" DROP COLUMN IF EXISTS "version";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "isArchived";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "lowStockThreshold";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "costPrice";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "description";

COMMIT;
