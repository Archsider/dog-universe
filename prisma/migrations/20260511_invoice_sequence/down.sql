-- Rollback for 20260511_invoice_sequence.
-- Drops the InvoiceSequence table. The Invoice rows + their invoiceNumber
-- values are untouched — only the per-year counter table is removed.
DROP TABLE IF EXISTS "InvoiceSequence" CASCADE;
