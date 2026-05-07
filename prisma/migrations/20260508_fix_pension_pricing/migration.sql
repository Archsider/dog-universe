-- Fix pension pricing: align all existing BOARDING InvoiceItems with the
-- canonical rule (centralised in `lib/pricing.ts → getPensionPrice`):
--
--   - Cat                : 70 MAD/night
--   - Dog, ≥ 32 nights   : 100 MAD/night
--   - 2+ dogs            : 100 MAD/night/dog
--   - 1 dog, < 32 nights : 120 MAD/night
--
-- For each Booking we recompute its pets composition + nights, then update
-- every BOARDING InvoiceItem attached to that booking's invoice. Cat lines
-- are detected from the description suffix `(chat)` (legacy convention) —
-- the new code path also writes `(chat)` so future rows stay consistent.

WITH booking_pets AS (
  SELECT
    b.id AS booking_id,
    COUNT(*) FILTER (WHERE p.species = 'DOG') AS dogs_count,
    COUNT(*) FILTER (WHERE p.species = 'CAT') AS cats_count,
    GREATEST(
      (COALESCE(b."endDate", NOW())::date - b."startDate"::date),
      1
    ) AS nights
  FROM "Booking" b
  LEFT JOIN "BookingPet" bp ON bp."bookingId" = b.id
  LEFT JOIN "Pet" p ON p.id = bp."petId"
  GROUP BY b.id, b."startDate", b."endDate"
),
correct_prices AS (
  SELECT
    ii.id AS item_id,
    ii.quantity AS qty,
    CASE
      WHEN ii.description ILIKE '%(chat)%' THEN 70
      WHEN bp.nights >= 32                  THEN 100
      WHEN bp.dogs_count >= 2               THEN 100
      ELSE 120
    END::numeric AS new_unit_price
  FROM "InvoiceItem" ii
  JOIN "Invoice" i ON i.id = ii."invoiceId"
  JOIN booking_pets bp ON bp.booking_id = i."bookingId"
  WHERE ii."category" = 'BOARDING'
)
UPDATE "InvoiceItem" ii
SET
  "unitPrice" = cp.new_unit_price,
  "total"     = cp.new_unit_price * cp.qty
FROM correct_prices cp
WHERE ii.id = cp.item_id;

-- Recaler invoice.amount = sum(items.total) sur toutes les factures dont
-- au moins un item BOARDING vient d'être recalculé.
UPDATE "Invoice" inv
SET "amount" = COALESCE((
  SELECT SUM(ii2."total")
  FROM "InvoiceItem" ii2
  WHERE ii2."invoiceId" = inv.id
), 0)
WHERE inv.id IN (
  SELECT DISTINCT "invoiceId"
  FROM "InvoiceItem"
  WHERE "category" = 'BOARDING'
);

-- Marker (idempotent) — le runner db-migrate.mjs gère déjà _app_migrations,
-- ceci est un filet pour les exécutions manuelles via le SQL Editor Supabase.
INSERT INTO "_app_migrations"(name)
VALUES ('20260508_fix_pension_pricing')
ON CONFLICT DO NOTHING;
