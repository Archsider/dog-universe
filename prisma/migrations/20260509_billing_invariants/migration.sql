-- INVARIANTS DE FACTURATION — bloque au niveau DB toute écriture qui
-- casserait la cohérence. Si jamais une migration ou du code applicatif
-- essaie de réécrire des montants incohérents, Postgres rollback la
-- transaction et l'erreur remonte au build → on voit le bug AVANT prod.
--
-- ATTENTION : nettoyage préalable obligatoire (recovery v2 d'abord).
-- Si des données incohérentes existent, l'ALTER TABLE ADD CONSTRAINT échoue.

-- ──────────────────────────────────────────────────────────────────────────
-- 1) Stock produit jamais négatif
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE "Product"
DROP CONSTRAINT IF EXISTS "Product_stock_nonneg";

ALTER TABLE "Product"
ADD CONSTRAINT "Product_stock_nonneg"
  CHECK ("stock" >= 0);

-- ──────────────────────────────────────────────────────────────────────────
-- 2) InvoiceItem cohérent : quantity > 0 et total = unitPrice × quantity
--    (à 0.01 près, tolérance d'arrondi sur Decimal(10,2))
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE "InvoiceItem"
DROP CONSTRAINT IF EXISTS "InvoiceItem_qty_positive";

ALTER TABLE "InvoiceItem"
ADD CONSTRAINT "InvoiceItem_qty_positive"
  CHECK (quantity > 0);

ALTER TABLE "InvoiceItem"
DROP CONSTRAINT IF EXISTS "InvoiceItem_total_consistent";

ALTER TABLE "InvoiceItem"
ADD CONSTRAINT "InvoiceItem_total_consistent"
  CHECK (ABS(total - "unitPrice" * quantity) < 0.01);

-- ──────────────────────────────────────────────────────────────────────────
-- 3) Invoice cohérent : paidAmount <= amount (sauf si annulée)
--    Tolérance 0.01 MAD pour les arrondis multi-paiements.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE "Invoice"
DROP CONSTRAINT IF EXISTS "Invoice_paid_lte_amount";

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_paid_lte_amount"
  CHECK (status = 'CANCELLED' OR "paidAmount" <= "amount" + 0.01);

ALTER TABLE "Invoice"
DROP CONSTRAINT IF EXISTS "Invoice_amount_nonneg";

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_amount_nonneg"
  CHECK ("amount" >= 0 AND "paidAmount" >= 0);

-- ──────────────────────────────────────────────────────────────────────────
-- 4) Trigger : Invoice.amount = SUM(items.total) après chaque écriture
--    sur InvoiceItem. Bloque le drift à la source.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recompute_invoice_amount() RETURNS TRIGGER AS $$
DECLARE
  target_invoice_id text;
BEGIN
  -- target = invoiceId concerné selon l'opération
  IF TG_OP = 'DELETE' THEN
    target_invoice_id := OLD."invoiceId";
  ELSE
    target_invoice_id := NEW."invoiceId";
  END IF;

  UPDATE "Invoice"
  SET "amount" = COALESCE((
    SELECT SUM("total") FROM "InvoiceItem" WHERE "invoiceId" = target_invoice_id
  ), 0)
  WHERE id = target_invoice_id;

  -- Si UPDATE déplace un item d'une invoice à une autre, recalc l'ancienne aussi.
  IF TG_OP = 'UPDATE' AND OLD."invoiceId" <> NEW."invoiceId" THEN
    UPDATE "Invoice"
    SET "amount" = COALESCE((
      SELECT SUM("total") FROM "InvoiceItem" WHERE "invoiceId" = OLD."invoiceId"
    ), 0)
    WHERE id = OLD."invoiceId";
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recompute_invoice_amount ON "InvoiceItem";

CREATE TRIGGER trg_recompute_invoice_amount
  AFTER INSERT OR UPDATE OR DELETE ON "InvoiceItem"
  FOR EACH ROW EXECUTE FUNCTION recompute_invoice_amount();

INSERT INTO "_app_migrations"(name)
VALUES ('20260509_billing_invariants')
ON CONFLICT DO NOTHING;
