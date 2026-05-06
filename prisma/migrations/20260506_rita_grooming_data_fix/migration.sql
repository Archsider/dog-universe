-- Data fix : forcer category='GROOMING' sur l'item toilettage 100 MAD de
-- Rita Kabbaj qui avait été persisté avec la mauvaise catégorie. Idempotent
-- (UPDATE conditionnelle, no-op si déjà GROOMING ou si l'item n'existe pas).
-- Pas d'INSERT côté ce fichier — si la ligne est totalement absente, l'admin
-- la recrée depuis l'UI (workflow normal). Le but ici : reclasser ce qui
-- existe et empêcher de pourrir les KPIs catégorie.
UPDATE "InvoiceItem" ii
SET category = 'GROOMING'
WHERE ii."productId" IS NULL
  AND ii.category <> 'GROOMING'
  AND ii.total = 100
  AND (ii.description ILIKE '%toilettage%' OR ii.description ILIKE '%grooming%')
  AND ii."invoiceId" IN (
    SELECT i.id
    FROM "Invoice" i
    JOIN "User" u ON u.id = i."clientId"
    WHERE u.name ILIKE '%Rita%Kabbaj%'
  );

-- Garde-fou général : tout item lié à un produit doit avoir category='PRODUCT'.
-- Idempotent : la WHERE filtre les items déjà bons.
UPDATE "InvoiceItem"
SET category = 'PRODUCT'
WHERE "productId" IS NOT NULL AND category <> 'PRODUCT';
