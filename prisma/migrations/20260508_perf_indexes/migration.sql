-- Migration: 20260508_perf_indexes
-- Indexes additionnels pour les hot paths analytics + billing.
-- CREATE INDEX CONCURRENTLY ne peut tourner dans une transaction → la
-- runner détecte le mot-clé CONCURRENTLY et exécute hors-tx.
--
-- Indexes déjà présents (skip) :
--   Booking(status), Booking(startDate), Booking(endDate)
--   Payment(paymentDate)  -- "paidAt" dans le langage produit
--   Invoice.bookingId @unique (index implicite)

-- Composite : aggregation rapide par catégorie sur une facture donnée
-- (ex: drilldown analytics, allocation séquentielle).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "InvoiceItem_invoiceId_category_idx"
  ON "InvoiceItem" ("invoiceId", "category");
