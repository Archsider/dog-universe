-- Renuméroter toutes les factures non supprimées par periodDate ASC puis createdAt ASC
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           ORDER BY COALESCE("periodDate", "createdAt") ASC, "createdAt" ASC
         ) AS rn
  FROM "Invoice"
  WHERE "deletedAt" IS NULL
)
UPDATE "Invoice" i
SET "invoiceNumber" = 'DU-2026-' || LPAD(r.rn::text, 4, '0')
FROM ranked r
WHERE i.id = r.id;

-- Vérification
SELECT "invoiceNumber", "periodDate", "createdAt"
FROM "Invoice"
WHERE "deletedAt" IS NULL
ORDER BY "invoiceNumber" ASC
LIMIT 20;
