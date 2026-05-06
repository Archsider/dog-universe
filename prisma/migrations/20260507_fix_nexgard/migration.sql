-- Migration: 20260507_fix_nexgard
-- Defensive fix : forcer PRODUCT sur tout item lié à un Product ou décrit
-- comme un Nexgard, même si la migration 20260507_cleanup_categories n'a
-- pas tourné ou a oublié des rows. Idempotent.

UPDATE "InvoiceItem"
SET "category" = 'PRODUCT'
WHERE "productId" IS NOT NULL
  AND "category" != 'PRODUCT';

UPDATE "InvoiceItem"
SET "category" = 'PRODUCT'
WHERE "description" ILIKE '%nexgard%'
  AND "category" != 'PRODUCT';
