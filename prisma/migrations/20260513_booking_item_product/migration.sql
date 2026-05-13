-- Booking items extension: link to Product catalogue + extend ItemCategory.
-- Idempotent. @safety: reviewed
-- @rollback: see down.sql

-- BookingItem.productId (FK Product, nullable, SET NULL on delete)
ALTER TABLE "BookingItem" ADD COLUMN IF NOT EXISTS "productId" TEXT;

DO $$ BEGIN
  ALTER TABLE "BookingItem"
    ADD CONSTRAINT "BookingItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"(id)
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BookingItem_productId_idx" ON "BookingItem"("productId");

-- Extend ItemCategory enum with EXTRA_SERVICE and MISC_FEE.
-- ADD VALUE IF NOT EXISTS is idempotent and safe on a live enum.
ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'EXTRA_SERVICE';
ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'MISC_FEE';
