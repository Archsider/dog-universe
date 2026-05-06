-- InvoiceItem.productId : lien optionnel vers le produit du stock.
-- Règle métier : quand productId est non-null, category vaut 'PRODUCT' (pas
-- 'GROOMING' ni autre — la prestation toilettage n'a jamais de productId).
-- Idempotent — peut être rejoué sans casse via le runner scripts/db-migrate.mjs.
ALTER TABLE "InvoiceItem"
  ADD COLUMN IF NOT EXISTS "productId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'InvoiceItem_productId_fkey'
      AND table_name = 'InvoiceItem'
  ) THEN
    ALTER TABLE "InvoiceItem"
      ADD CONSTRAINT "InvoiceItem_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- Backfill par cohérence : tout item lié à un produit doit avoir
-- category='PRODUCT'. No-op tant qu'aucun item n'est encore lié, conservé
-- pour les futures migrations / réimports.
UPDATE "InvoiceItem"
SET "category" = 'PRODUCT'
WHERE "productId" IS NOT NULL AND "category" <> 'PRODUCT';
