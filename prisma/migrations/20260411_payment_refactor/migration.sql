-- Migration: 20260411_payment_refactor
-- Refonte système de paiement — à exécuter sur Supabase SQL editor
--
-- Ordre impératif :
--   1. Créer la table Payment
--   2. Ajouter les colonnes InvoiceItem
--   3. Migrer les données existantes vers Payment  ← avant le DROP COLUMN
--   4. Allouer les paiements par ligne de facture
--   5. Supprimer paymentMethod et paymentDate de Invoice

-- ── 1. Créer la table Payment ──────────────────────────────────────────────

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

-- ── 2. Ajouter les champs de suivi sur InvoiceItem ─────────────────────────

ALTER TABLE "InvoiceItem"
    ADD COLUMN IF NOT EXISTS "allocatedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';

-- ── 3. Migrer les données existantes → Payment ─────────────────────────────
-- Pour chaque facture avec paidAmount > 0 et paymentMethod renseigné,
-- créer un Payment row unique (versement unique dans l'ancien système).

INSERT INTO "Payment" ("id", "invoiceId", "amount", "paymentMethod", "paymentDate", "notes", "createdAt")
SELECT
    gen_random_uuid()::text,
    i.id,
    i."paidAmount",
    i."paymentMethod",
    COALESCE(i."paymentDate", i."issuedAt"),
    'Migré depuis ancien système',
    NOW()
FROM "Invoice" i
WHERE i."paidAmount" > 0
  AND i."paymentMethod" IS NOT NULL;

-- ── 4. Allouer les paiements sur les InvoiceItems ──────────────────────────
-- Répartition par priorité : Pension (0) → Taxi (1) → Autres (2)
-- Dans chaque groupe, ordre d'insertion (id ASC).

DO $$
DECLARE
  rec  RECORD;
  item RECORD;
  rem  DOUBLE PRECISION;
BEGIN
  FOR rec IN
    SELECT i.id          AS invoice_id,
           i.amount      AS invoice_amount,
           COALESCE(SUM(p.amount), 0) AS total_paid
    FROM "Invoice" i
    LEFT JOIN "Payment" p ON p."invoiceId" = i.id
    WHERE i."paidAmount" > 0
    GROUP BY i.id, i.amount
  LOOP
    rem := rec.total_paid;

    FOR item IN
      SELECT id, total
      FROM "InvoiceItem"
      WHERE "invoiceId" = rec.invoice_id
      ORDER BY
        CASE
          WHEN LOWER(description) LIKE '%pension%'   THEN 0
          WHEN LOWER(description) LIKE '%nuit%'      THEN 0
          WHEN LOWER(description) LIKE '%séjour%'    THEN 0
          WHEN LOWER(description) LIKE '%boarding%'  THEN 0
          WHEN LOWER(description) LIKE '%taxi%'      THEN 1
          WHEN LOWER(description) LIKE '%transport%' THEN 1
          ELSE 2
        END,
        id ASC
    LOOP
      IF rem >= item.total THEN
        UPDATE "InvoiceItem"
          SET "allocatedAmount" = item.total,
              status            = 'PAID'
          WHERE id = item.id;
        rem := rem - item.total;
      ELSIF rem > 0 THEN
        UPDATE "InvoiceItem"
          SET "allocatedAmount" = rem,
              status            = 'PARTIAL'
          WHERE id = item.id;
        rem := 0;
      ELSE
        UPDATE "InvoiceItem"
          SET "allocatedAmount" = 0,
              status            = 'PENDING'
          WHERE id = item.id;
      END IF;
    END LOOP;

    -- Recalculer paidAmount et status sur Invoice depuis SUM(Payment.amount)
    UPDATE "Invoice"
      SET "paidAmount" = rec.total_paid,
          status = CASE
            WHEN rec.total_paid <= 0                   THEN 'PENDING'
            WHEN rec.total_paid < rec.invoice_amount   THEN 'PARTIALLY_PAID'
            ELSE                                            'PAID'
          END
      WHERE id = rec.invoice_id;
  END LOOP;
END $$;

-- ── 5. Supprimer paymentMethod et paymentDate de Invoice ───────────────────
-- Exécuté en dernier : les données ont déjà été migrées vers Payment (étape 3).

ALTER TABLE "Invoice"
    DROP COLUMN IF EXISTS "paymentMethod",
    DROP COLUMN IF EXISTS "paymentDate";
