-- Reverse of 20260513_booking_item_product.
-- Note: Postgres ne supporte pas DROP VALUE sur un enum sans recréer le type.
-- On laisse les valeurs EXTRA_SERVICE/MISC_FEE en place (additif, sans impact).
BEGIN;

DROP INDEX IF EXISTS "BookingItem_productId_idx";
DROP INDEX IF EXISTS "BookingItem_invoiceItemId_idx";

ALTER TABLE "BookingItem" DROP CONSTRAINT IF EXISTS "BookingItem_productId_fkey";
ALTER TABLE "BookingItem" DROP CONSTRAINT IF EXISTS "BookingItem_invoiceItemId_fkey";
ALTER TABLE "BookingItem" DROP COLUMN IF EXISTS "productId";
ALTER TABLE "BookingItem" DROP COLUMN IF EXISTS "invoiceItemId";

COMMIT;
