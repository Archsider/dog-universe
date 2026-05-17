-- @safety: reviewed — new table only, idempotent (IF NOT EXISTS everywhere).
-- @rollback: see down.sql
--
-- Smart catalog suggestions table — populated weekly by the
-- product-catalog-suggestions cron. Each row is a fuzzy match between an
-- InvoiceItem with category='OTHER' and a Product.name. Admin reviews
-- on /admin/products/suggestions and accepts/rejects.

BEGIN;

CREATE TABLE IF NOT EXISTS "ProductCatalogSuggestion" (
  "id"                  TEXT PRIMARY KEY,
  "invoiceItemId"       TEXT NOT NULL UNIQUE,
  "suggestedProductId"  TEXT NOT NULL,
  "confidence"          DOUBLE PRECISION NOT NULL,
  "matchedTokens"       TEXT[] NOT NULL DEFAULT '{}',
  "status"              TEXT NOT NULL DEFAULT 'pending',
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt"         TIMESTAMP(3),
  "respondedBy"         TEXT,
  CONSTRAINT "ProductCatalogSuggestion_status_check"
    CHECK ("status" IN ('pending', 'accepted', 'rejected')),
  CONSTRAINT "ProductCatalogSuggestion_confidence_check"
    CHECK ("confidence" >= 0 AND "confidence" <= 1)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductCatalogSuggestion_suggestedProductId_fkey'
  ) THEN
    ALTER TABLE "ProductCatalogSuggestion"
      ADD CONSTRAINT "ProductCatalogSuggestion_suggestedProductId_fkey"
      FOREIGN KEY ("suggestedProductId") REFERENCES "Product"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ProductCatalogSuggestion_status_createdAt_idx"
  ON "ProductCatalogSuggestion"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ProductCatalogSuggestion_suggestedProductId_idx"
  ON "ProductCatalogSuggestion"("suggestedProductId");

COMMIT;
