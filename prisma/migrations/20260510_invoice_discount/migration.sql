-- Ajout de la valeur 'DISCOUNT' à l'enum ItemCategory pour pouvoir
-- créer des InvoiceItem de type remise (montant négatif).
--
-- Convention : un item DISCOUNT a quantity=1, unitPrice<0, total=unitPrice*1.
-- Le trigger trg_recompute_invoice_amount recalcule Invoice.amount =
-- SUM(items.total) automatiquement → la remise est déduite du total.
--
-- Note : ALTER TYPE ... ADD VALUE n'est pas annulable dans une
-- transaction multi-statement en PG, donc cette migration ne contient
-- qu'une seule instruction ADD VALUE (sécurité Supabase SQL Editor).

ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'DISCOUNT';

INSERT INTO "_app_migrations"(name)
VALUES ('20260510_invoice_discount')
ON CONFLICT DO NOTHING;
