-- RECOVERY v2 — Plus défensive que v1 :
--
-- v1 ne touchait que les items où `quantity = 1 AND nights > 1`. Insuffisant
-- pour les bookings qui n'ont pas matché (booking sans endDate qui a fait
-- nights=1, multiple BOARDING items combinés, etc).
--
-- Stratégie v2 : reconstruction inconditionnelle de tous les BOARDING items
-- liés à un booking, en partant des nuits réelles. Idempotent — un item
-- déjà correct (qty=12, unitPrice=120, total=1440) reste tel quel.

-- Pass 1 — recompute quantity et total sur TOUS les BOARDING items liés
-- à un booking, à partir des nuits réelles (durée du séjour).
WITH booking_nights AS (
  SELECT
    b.id AS booking_id,
    GREATEST(
      (COALESCE(b."endDate", NOW())::date - b."startDate"::date),
      1
    )::int AS nights
  FROM "Booking" b
  WHERE b."deletedAt" IS NULL
)
UPDATE "InvoiceItem" ii
SET
  quantity = bn.nights,
  total    = ii."unitPrice" * bn.nights
FROM "Invoice" inv, booking_nights bn
WHERE ii."invoiceId"  = inv.id
  AND inv."bookingId" = bn.booking_id
  AND ii."category"   = 'BOARDING';

-- Pass 2 — recompute invoice.amount = SUM(items.total) sur toutes les factures.
UPDATE "Invoice" inv
SET "amount" = COALESCE((
  SELECT SUM(ii2."total")
  FROM "InvoiceItem" ii2
  WHERE ii2."invoiceId" = inv.id
), 0);

-- Pass 3 (safety net) — pour les factures encore incohérentes
-- (paidAmount > amount, càd une caisse > facturé), réajuster le BOARDING
-- item d'écart manquant. Ces cas sont des données très anciennes où on
-- ne peut pas reconstruire les nuits via le booking (booking absent ou
-- soft-deleted, par exemple). On préserve la vérité comptable de la caisse.
WITH broken AS (
  SELECT
    inv.id            AS invoice_id,
    inv."paidAmount" - inv."amount" AS missing
  FROM "Invoice" inv
  WHERE inv."paidAmount" > inv."amount"
),
target_item AS (
  SELECT
    b.invoice_id,
    b.missing,
    (
      SELECT id FROM "InvoiceItem"
      WHERE "invoiceId" = b.invoice_id
        AND "category"  = 'BOARDING'
      ORDER BY id
      LIMIT 1
    ) AS item_id
  FROM broken b
)
UPDATE "InvoiceItem" ii
SET
  total       = ii.total + ti.missing,
  "unitPrice" = (ii.total + ti.missing) / GREATEST(ii.quantity, 1)
FROM target_item ti
WHERE ii.id = ti.item_id
  AND ti.item_id IS NOT NULL;

-- Pass 4 — recompute invoice.amount une fois encore après la safety net.
UPDATE "Invoice" inv
SET "amount" = COALESCE((
  SELECT SUM(ii2."total")
  FROM "InvoiceItem" ii2
  WHERE ii2."invoiceId" = inv.id
), 0);

INSERT INTO "_app_migrations"(name)
VALUES ('20260508_recover_v2_force_nights')
ON CONFLICT DO NOTHING;
