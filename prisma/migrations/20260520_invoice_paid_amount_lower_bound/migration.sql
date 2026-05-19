-- CHECK constraint : Invoice.paidAmount must NEVER go negative.
--
-- A refund that exceeds the original payment(s) currently leaves paidAmount
-- as a negative Decimal because `recordPayment` recomputes from the sum of
-- Payment.amount (some of which can be negative for refunds).  The existing
-- upper-bound CHECK (`paidAmount <= amount + 0.01`) doesn't protect the
-- lower bound — so a money path bug could quietly produce -200 MAD without
-- any DB-level guard.
--
-- 0.01 tolerance accommodates the same arithmetic rounding the upper-bound
-- check uses (cf. 20260509_invoice_amount_trigger).
--
-- Source : multi-agent audit Wave 2, 2026-05-19.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'Invoice' AND constraint_name = 'Invoice_paidAmount_not_negative'
  ) THEN
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_paidAmount_not_negative"
      CHECK ("paidAmount" >= -0.01);
  END IF;
END $$;
