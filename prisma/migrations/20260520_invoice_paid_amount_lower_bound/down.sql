ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_paidAmount_not_negative";
DELETE FROM "_app_migrations" WHERE name = '20260520_invoice_paid_amount_lower_bound';
