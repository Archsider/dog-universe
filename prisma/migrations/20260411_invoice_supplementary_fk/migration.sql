-- Add supplementaryForBookingId to Invoice
-- Replaces the fragile "notes LIKE 'EXTENSION_SURCHARGE:%'" pattern with a proper indexed column.

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "supplementaryForBookingId" TEXT;

CREATE INDEX IF NOT EXISTS "Invoice_supplementaryForBookingId_idx"
  ON "Invoice"("supplementaryForBookingId");

-- Backfill existing extension-surcharge invoices from the notes pattern
UPDATE "Invoice"
  SET "supplementaryForBookingId" = SUBSTRING("notes" FROM 21)
  WHERE "notes" LIKE 'EXTENSION_SURCHARGE:%'
    AND "supplementaryForBookingId" IS NULL;
