-- Rollback to the 20260515_revenue_mv_semantic_a definition (no CANCELLED filter).
--
-- Running this re-introduces the false-positive `js_vs_mv_current_month`
-- flag on /admin/guardian/invariants for any month containing a CANCELLED
-- full-paid invoice. The application-code rollback (re-introducing the
-- `getMonthlyInvoicesWhere` path on the JS side) would also restore the
-- asymmetry, so the two halves stay consistent with each other.

DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_mv;

CREATE MATERIALIZED VIEW monthly_revenue_mv AS
WITH invoice_paid_status AS (
  SELECT
    i."id"                        AS invoice_id,
    i."amount"                    AS invoice_amount,
    SUM(p."amount")               AS paid_total,
    MAX(p."paymentDate")          AS last_paid_at
  FROM "Invoice"  i
  JOIN "Payment"  p ON p."invoiceId" = i."id"
  WHERE p."paymentDate" IS NOT NULL
  GROUP BY i."id", i."amount"
),
closed_invoices AS (
  SELECT
    invoice_id,
    last_paid_at
  FROM invoice_paid_status
  WHERE paid_total >= invoice_amount - 0.01
)
SELECT
  EXTRACT(YEAR  FROM ci.last_paid_at)::int                       AS year,
  EXTRACT(MONTH FROM ci.last_paid_at)::int                       AS month,
  CASE
    WHEN ii."category" = 'BOARDING' THEN 'BOARDING'
    WHEN ii."category" = 'PET_TAXI' THEN 'PET_TAXI'
    WHEN ii."category" = 'GROOMING' THEN 'GROOMING'
    WHEN ii."category" = 'PRODUCT'  THEN 'PRODUCT'
    WHEN ii."description" ~* '(pension|boarding|nuit|hébergement)'              THEN 'BOARDING'
    WHEN ii."description" ~* '(taxi|transport|aller|retour)'                    THEN 'PET_TAXI'
    WHEN ii."description" ~* '(toilettage|grooming|soin|bain|coupe)'            THEN 'GROOMING'
    WHEN ii."description" ~* '(croquette|kibble|nourriture|royal|grain)'        THEN 'PRODUCT'
    ELSE 'OTHER'
  END                                                            AS category,
  SUM(ii."total")::numeric(14, 2)                                AS total,
  COUNT(DISTINCT ci.invoice_id)::int                             AS "invoiceCount"
FROM closed_invoices ci
JOIN "InvoiceItem" ii ON ii."invoiceId" = ci.invoice_id
GROUP BY 1, 2, 3
WITH NO DATA;

CREATE UNIQUE INDEX monthly_revenue_mv_pk
  ON monthly_revenue_mv (year, month, category);

CREATE INDEX monthly_revenue_mv_year_month_idx
  ON monthly_revenue_mv (year, month);

REFRESH MATERIALIZED VIEW monthly_revenue_mv;
