-- Indexes de billing — à exécuter MANUELLEMENT sur Supabase.
-- CONCURRENTLY ne peut pas tourner dans une transaction Prisma : ne pas
-- utiliser `prisma migrate deploy` pour ces lignes. Exécuter directement
-- dans le SQL Editor Supabase, une commande à la fois.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_paymentMethod_idx"
  ON "Payment" ("paymentMethod");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "InvoiceItem_category_idx"
  ON "InvoiceItem" ("category");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_clientId_status_idx"
  ON "Invoice" ("clientId", "status");
