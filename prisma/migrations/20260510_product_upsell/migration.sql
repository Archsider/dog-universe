-- Extension du modèle Product pour l'upsell smart par espèce + âge.
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "targetSpecies" TEXT NOT NULL DEFAULT 'BOTH',
  ADD COLUMN IF NOT EXISTS "targetAge"     TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS "imageUrl"      TEXT,
  ADD COLUMN IF NOT EXISTS "weight"        TEXT,
  ADD COLUMN IF NOT EXISTS "supplier"      TEXT;

ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_targetSpecies_check";
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_targetSpecies_check"
    CHECK ("targetSpecies" IN ('DOG', 'CAT', 'BOTH'));

ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_targetAge_check";
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_targetAge_check"
    CHECK ("targetAge" IN ('PUPPY', 'JUNIOR', 'ADULT', 'SENIOR', 'ALL'));

CREATE INDEX IF NOT EXISTS "Product_targeting_idx"
  ON "Product"("targetSpecies", "targetAge", "available");

INSERT INTO "_app_migrations"(name)
VALUES ('20260510_product_upsell')
ON CONFLICT DO NOTHING;
