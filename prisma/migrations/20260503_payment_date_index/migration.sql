-- Add indexes on Payment.paymentDate for billing analytics queries
-- (monthly revenue filters, date-range aggregations)
CREATE INDEX IF NOT EXISTS "Payment_paymentDate_idx" ON "Payment"("paymentDate");
CREATE INDEX IF NOT EXISTS "Payment_invoiceId_paymentDate_idx" ON "Payment"("invoiceId", "paymentDate");
