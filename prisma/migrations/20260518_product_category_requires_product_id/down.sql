-- Rollback for 20260518_product_category_requires_product_id.
--
-- Drops the CHECK constraint only. The STEP 1 data normalisation
-- (UPDATE rows linking PRODUCT items to productId, [Auto-fix] re-tagging
-- of unresolvable rows) is intentionally NOT reverted — the data was
-- inconsistent before this migration and we don't want to re-introduce
-- bogus PRODUCT-without-productId rows in case of rollback.

BEGIN;

ALTER TABLE "InvoiceItem"
  DROP CONSTRAINT IF EXISTS "InvoiceItem_product_category_has_productId";

DELETE FROM "_app_migrations"
WHERE name = '20260518_product_category_requires_product_id';

COMMIT;
