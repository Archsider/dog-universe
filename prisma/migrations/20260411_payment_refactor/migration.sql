-- Migration: 20260411_payment_refactor
-- Refonte système de paiement : table Payment + champs InvoiceItem + nettoyage Invoice
-- Execute on Supabase SQL editor

-- 1. Créer la table Payment
CREATE TABLE IF NOT EXISTS "Payment" (
    "id"            TEXT NOT NULL,
    "invoiceId"     TEXT NOT NULL,
    "amount"        DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentDate"   TIMESTAMP(3) NOT NULL,
    "notes"         TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId")
        REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- 2. Ajouter les champs de suivi sur InvoiceItem
ALTER TABLE "InvoiceItem"
    ADD COLUMN IF NOT EXISTS "allocatedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';

-- 3. Supprimer paymentMethod et paymentDate de Invoice
--    (ces données migrent vers la table Payment — voir étape 6)
ALTER TABLE "Invoice"
    DROP COLUMN IF EXISTS "paymentMethod",
    DROP COLUMN IF EXISTS "paymentDate";
