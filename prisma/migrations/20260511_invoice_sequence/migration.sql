-- Numérotation atomique des factures par année.
-- L'ancien algo `count() + 1` puis `findUnique` était sujet à race :
-- deux POST simultanés lisaient le même compteur et tentaient le même
-- numéro. Désormais : INSERT ... ON CONFLICT DO UPDATE RETURNING dans
-- une transaction → seq monotone garanti par année.

CREATE TABLE IF NOT EXISTS "InvoiceSequence" (
  year      INT PRIMARY KEY,
  "lastSeq" INT NOT NULL DEFAULT 0
);

-- Bootstrap les séquences pour les années existantes : on prend le
-- max numéro déjà attribué pour chaque année afin que les nouveaux
-- numéros ne collisent pas avec l'historique.
INSERT INTO "InvoiceSequence" (year, "lastSeq")
SELECT
  CAST(SUBSTRING("invoiceNumber" FROM 'DU-(\d{4})-') AS INT) AS year,
  MAX(CAST(SUBSTRING("invoiceNumber" FROM 'DU-\d{4}-(\d+)') AS INT)) AS "lastSeq"
FROM "Invoice"
WHERE "invoiceNumber" ~ '^DU-\d{4}-\d+$'
GROUP BY 1
ON CONFLICT (year) DO UPDATE
  SET "lastSeq" = GREATEST("InvoiceSequence"."lastSeq", EXCLUDED."lastSeq");

INSERT INTO "_app_migrations"(name)
VALUES ('20260511_invoice_sequence')
ON CONFLICT DO NOTHING;
