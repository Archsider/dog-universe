-- NORMALISATION GLOBALE des InvoiceItem.total
--
-- L'invariant `ABS(total - unitPrice × quantity) < 0.01` du
-- 20260509_billing_invariants a échoué avec
--   ERROR: 23514 check constraint "InvoiceItem_total_consistent" violated
-- car il restait des lignes legacy où le total avait été stocké à la main
-- (frais manuels, items non-BOARDING avec arrondis ad-hoc, etc).
--
-- Cette migration force `total = unitPrice × quantity` sur TOUTES les
-- lignes incohérentes (toutes catégories), puis recompute invoice.amount.
-- Idempotent — ré-exécutable sans effet sur les rows déjà cohérentes.

UPDATE "InvoiceItem"
SET total = "unitPrice" * quantity
WHERE ABS(total - "unitPrice" * quantity) >= 0.01;

UPDATE "Invoice" inv
SET "amount" = COALESCE((
  SELECT SUM("total") FROM "InvoiceItem" WHERE "invoiceId" = inv.id
), 0);

INSERT INTO "_app_migrations"(name)
VALUES ('20260508_zz_normalize_item_totals')
ON CONFLICT DO NOTHING;
