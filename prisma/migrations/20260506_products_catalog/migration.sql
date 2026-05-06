-- Migration: 20260506_products_catalog
-- Rename active → available, add category column on Product table.
-- Execute on Supabase SQL editor.

-- 1. Rename column active → available
ALTER TABLE "Product" RENAME COLUMN "active" TO "available";

-- 2. Add category column (nullable text)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "category" TEXT;

-- 3. Drop old index on "active" (no longer exists), recreate on "available"
DROP INDEX IF EXISTS "Product_active_idx";
CREATE INDEX IF NOT EXISTS "Product_available_idx" ON "Product"("available");
