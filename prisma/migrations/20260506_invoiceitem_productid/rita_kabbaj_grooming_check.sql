-- FIX 2 — Toilettage Rita Kabbaj 100 MAD manquant.
-- À exécuter manuellement sur Supabase pour diagnostiquer puis corriger.
-- Aucun accès DB direct depuis le harness Claude → exécution opérateur.

-- ─── 1. Trouver la facture ────────────────────────────────────────────────
-- Recherche sur le nom client + montant + libellé toilettage. Peut renvoyer
-- plusieurs lignes si Rita a plusieurs factures.
SELECT
  i.id            AS invoice_id,
  i."invoiceNumber",
  i."clientId",
  u.name          AS client_name,
  i.amount,
  i."paidAmount",
  i.status,
  i."issuedAt",
  i."bookingId",
  ii.id           AS item_id,
  ii.description,
  ii.total,
  ii.category,
  ii."productId"
FROM "Invoice" i
JOIN "User" u           ON u.id = i."clientId"
LEFT JOIN "InvoiceItem" ii ON ii."invoiceId" = i.id
WHERE u.name ILIKE '%Rita%Kabbaj%'
  AND (
    ii.description ILIKE '%toilettage%'
    OR ii.description ILIKE '%grooming%'
    OR ii.total = 100
  )
ORDER BY i."issuedAt" DESC, ii.id;

-- ─── 2. Vérifier le Payment ───────────────────────────────────────────────
SELECT
  p.id,
  p."invoiceId",
  p.amount,
  p."paymentMethod",
  p."paymentDate",
  p."createdAt"
FROM "Payment" p
JOIN "Invoice" i ON i.id = p."invoiceId"
JOIN "User" u    ON u.id = i."clientId"
WHERE u.name ILIKE '%Rita%Kabbaj%'
ORDER BY p."paymentDate" DESC;

-- ─── 3. Correctifs (à exécuter SEULEMENT si l'investigation confirme un défaut)

-- 3a. L'item existe mais category n'est pas GROOMING :
-- UPDATE "InvoiceItem"
-- SET category = 'GROOMING'
-- WHERE id = '<item_id>'
--   AND category <> 'GROOMING'
--   AND "productId" IS NULL;

-- 3b. L'item est manquant (la facture n'a pas la ligne toilettage) :
-- INSERT INTO "InvoiceItem" (id, "invoiceId", description, quantity, "unitPrice", total, category, status)
-- VALUES (
--   gen_random_uuid()::text,
--   '<invoice_id>',
--   'Toilettage',
--   1,
--   100.00,
--   100.00,
--   'GROOMING',
--   'PENDING'
-- );
-- UPDATE "Invoice" SET amount = amount + 100.00 WHERE id = '<invoice_id>';

-- 3c. Le Payment existe sans paymentDate (champ obligatoire — ne devrait
-- jamais arriver, mais on vérifie) :
-- UPDATE "Payment" SET "paymentDate" = "createdAt"
-- WHERE "paymentDate" IS NULL;
