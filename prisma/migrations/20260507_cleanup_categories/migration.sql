-- Migration: 20260507_cleanup_categories
-- Normalize InvoiceItem categories before locking the rule server-side.
--   1) Tous les items avec productId → PRODUCT obligatoirement
--   2) Items "toilettage" sans productId → GROOMING
-- Idempotent : ne touche que les rows qui ne sont pas déjà conformes.

UPDATE "InvoiceItem"
SET "category" = 'PRODUCT'
WHERE "productId" IS NOT NULL
  AND "category" != 'PRODUCT';

UPDATE "InvoiceItem"
SET "category" = 'GROOMING'
WHERE "description" ILIKE '%toilettage%'
  AND "productId" IS NULL
  AND "category" != 'GROOMING';
