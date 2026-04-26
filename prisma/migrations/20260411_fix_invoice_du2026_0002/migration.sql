-- =============================================================================
-- Migration : correctif facture DU-2026-0002 (post-merge)
-- Date      : 2026-04-11
-- Contexte  : Suite au merge de deux réservations BOARDING pour la même pension,
--             la facture DU-2026-0002 présentait trois anomalies :
--               1. Nuits affichées : 10  →  doit être 15 (02/04 au 17/04)
--               2. Pet Taxi Retour manquant (seul l'Aller était listé)
--               3. Statut PENDING  →  PARTIALLY_PAID ; section paiement absente
--               4. CA mensuel = 0 MAD (paiement TPE 1 350 MAD non comptabilisé)
-- =============================================================================

-- ── Étape 1 : Supprimer les anciennes lignes (nuits=10, taxi retour absent) ─

DELETE FROM "InvoiceItem"
WHERE "invoiceId" = (
  SELECT id FROM "Invoice" WHERE "invoiceNumber" = 'DU-2026-0002'
);

-- ── Étape 2 : Recréer les lignes correctes ──────────────────────────────────
-- 15 nuits × 120 MAD = 1 800 MAD
-- Pet Taxi Aller = 150 MAD
-- Pet Taxi Retour = 150 MAD
-- Total = 2 100 MAD

-- Ligne pension (nom du premier animal récupéré depuis la réservation liée)
INSERT INTO "InvoiceItem" (id, "invoiceId", description, quantity, "unitPrice", total)
SELECT
  gen_random_uuid()::text,
  inv.id,
  COALESCE('Pension ' || pet.name || ' (chien)', 'Pension (chien)'),
  15,
  120.0,
  1800.0
FROM "Invoice" inv
LEFT JOIN "Booking" bk ON bk.id = inv."bookingId"
LEFT JOIN "BookingPet" bp ON bp."bookingId" = bk.id
LEFT JOIN "Pet" pet ON pet.id = bp."petId" AND pet.species = 'DOG'
WHERE inv."invoiceNumber" = 'DU-2026-0002'
ORDER BY pet.name
LIMIT 1;

-- Ligne Pet Taxi — Aller
INSERT INTO "InvoiceItem" (id, "invoiceId", description, quantity, "unitPrice", total)
SELECT
  gen_random_uuid()::text,
  id,
  'Pet Taxi — Aller',
  1,
  150.0,
  150.0
FROM "Invoice"
WHERE "invoiceNumber" = 'DU-2026-0002';

-- Ligne Pet Taxi — Retour
INSERT INTO "InvoiceItem" (id, "invoiceId", description, quantity, "unitPrice", total)
SELECT
  gen_random_uuid()::text,
  id,
  'Pet Taxi — Retour',
  1,
  150.0,
  150.0
FROM "Invoice"
WHERE "invoiceNumber" = 'DU-2026-0002';

-- ── Étape 3 : Mettre à jour la facture (montant, statut, paiement partiel) ──

UPDATE "Invoice"
SET
  amount          = 2100.0,
  "paidAmount"    = 1350.0,
  status          = 'PARTIALLY_PAID',
  "paymentMethod" = 'CARD',                           -- TPE = carte bancaire
  "paymentDate"   = '2026-04-02 00:00:00+00',
  "updatedAt"     = NOW()
WHERE "invoiceNumber" = 'DU-2026-0002';

-- ── Étape 4 : Activer taxiReturnEnabled sur boardingDetail de la résa liée ──
-- Ce flag avait été supprimé lors du merge (il était sur la resa source)

UPDATE "BoardingDetail"
SET
  "taxiReturnEnabled" = true,
  "taxiAddonPrice"    = 300.0      -- 2 × 150 MAD (Aller + Retour)
WHERE "bookingId" = (
  SELECT "bookingId" FROM "Invoice" WHERE "invoiceNumber" = 'DU-2026-0002'
);

-- ── Étape 5 : Synchroniser totalPrice de la réservation ───────────────────

UPDATE "Booking"
SET
  "totalPrice" = 2100.0,
  "updatedAt"  = NOW()
WHERE id = (
  SELECT "bookingId" FROM "Invoice" WHERE "invoiceNumber" = 'DU-2026-0002'
);
