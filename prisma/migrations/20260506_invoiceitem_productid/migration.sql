-- InvoiceItem.productId : lien optionnel vers le produit du stock.
-- Règle métier : quand productId est non-null, category vaut 'PRODUCT' (pas
-- 'GROOMING' ni autre — la prestation toilettage n'a jamais de productId).
ALTER TABLE "InvoiceItem"
  ADD COLUMN "productId" TEXT;

ALTER TABLE "InvoiceItem"
  ADD CONSTRAINT "InvoiceItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- Backfill par cohérence : tout item lié à un produit doit avoir
-- category='PRODUCT'. No-op tant qu'aucun item n'est encore lié, conservé
-- pour les futures migrations / réimports.
UPDATE "InvoiceItem"
SET "category" = 'PRODUCT'
WHERE "productId" IS NOT NULL AND "category" <> 'PRODUCT';
