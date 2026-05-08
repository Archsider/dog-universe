-- RECOVERY — La migration `20260508_fix_pension_pricing` a corrompu les
-- factures legacy qui stockaient le BOARDING en UNE ligne avec
-- `quantity = 1` et `unitPrice = full_invoice_amount` (ex 1.200 MAD pour
-- 12 nuits). En appliquant la règle pension (100 ou 120 MAD/nuit), elle a
-- réécrit unitPrice mais a gardé quantity à 1 → total = 100 × 1 = 100 MAD,
-- soit ~10× moins que le montant réel encaissé.
--
-- Symptôme : invoice.paidAmount > invoice.amount (caisse déjà perçue
-- supérieure au facturé après recalcul).
--
-- Stratégie de recovery :
--   1. Pour chaque InvoiceItem BOARDING avec quantity = 1 sur une
--      réservation multi-nuits (nights > 1), reconstruire :
--        quantity = nights réelles du booking
--        total    = unitPrice × nights
--      L'unitPrice (déjà ajusté à 70/100/120 MAD/nuit par la migration
--      précédente) est correct selon la règle métier.
--
--   2. Recalculer `invoice.amount = SUM(items.total)` sur toutes les
--      factures dont au moins un item BOARDING a été touché.

WITH booking_nights AS (
  SELECT
    b.id AS booking_id,
    GREATEST(
      (COALESCE(b."endDate", NOW())::date - b."startDate"::date),
      1
    ) AS nights
  FROM "Booking" b
)
UPDATE "InvoiceItem" ii
SET
  quantity  = bn.nights,
  total     = ii."unitPrice" * bn.nights
FROM "Invoice" inv, booking_nights bn
WHERE ii."invoiceId"  = inv.id
  AND inv."bookingId" = bn.booking_id
  AND ii."category"   = 'BOARDING'
  AND ii.quantity     = 1
  AND bn.nights       > 1;

-- Recaler invoice.amount = sum(items.total) pour TOUTES les factures
-- (toutes peuvent être touchées par le passage précédent + celui-ci).
UPDATE "Invoice" inv
SET "amount" = COALESCE((
  SELECT SUM(ii2."total")
  FROM "InvoiceItem" ii2
  WHERE ii2."invoiceId" = inv.id
), 0);

-- Marker idempotent — le runner db-migrate.mjs gère aussi _app_migrations.
INSERT INTO "_app_migrations"(name)
VALUES ('20260508_recover_legacy_boarding_quantities')
ON CONFLICT DO NOTHING;
