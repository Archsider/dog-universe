-- monthly_revenue_mv — rewrite under sémantique A (facture close ce mois).
-- See `src/lib/accounting.ts` for the full rationale and
-- `docs/REVENUE_ATTRIBUTION_DECISION.md` for the decision record.
--
-- Old rule (2026-05-09 → 2026-05-14, dropped here): per-item pro-rata —
--   total = item.total × (payment.amount / invoice.amount)
-- Produced centime-fractional buckets (4.26 MAD grooming for Rita's case)
-- AND drifted from the JS path `computeMonthlyRevenueByCategory` which used
-- FIFO sequential allocation (40 MAD for the same case).
--
-- New rule (sémantique A):
--   (1) only invoices fully paid (SUM(payments.amount) >= invoice.amount,
--       1-centime tolerance) contribute
--   (2) they contribute to the (year, month) of MAX(payments.paymentDate)
--   (3) each item credits its full `total` to its category bucket
--
-- Description-based category inference: legacy `OTHER` rows whose description
-- contains "pension", "taxi", etc. are bucketed by the inferred category, in
-- sync with `src/lib/category.ts → categoryKey`. Without this the MV would
-- attribute Rita's "Pension Mamy (chien)" (stored as category=OTHER) to the
-- `OTHER` bucket while the JS path correctly bucketed it as BOARDING —
-- exactly the drift we are eliminating.
--
-- Read path: `metrics.ts → readRevenueFromMV` reads (year, month, category,
-- total). `cashByMonth` reads the whole year in one shot. Both unchanged
-- structurally — only the underlying numbers change.

DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_mv;

CREATE MATERIALIZED VIEW monthly_revenue_mv AS
WITH invoice_paid_status AS (
  -- Per invoice: total paid + last payment date. Excludes invoices with no
  -- payments at all (a PENDING-only invoice has no contribution under A).
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
  -- Apply the "fully paid" gate with a 1-centime tolerance. Same constant as
  -- FULL_PAID_TOLERANCE in src/lib/accounting.ts — keep them in sync.
  SELECT
    invoice_id,
    last_paid_at
  FROM invoice_paid_status
  WHERE paid_total >= invoice_amount - 0.01
)
SELECT
  EXTRACT(YEAR  FROM ci.last_paid_at)::int                       AS year,
  EXTRACT(MONTH FROM ci.last_paid_at)::int                       AS month,
  -- Bucket inference. Mirrors src/lib/category.ts → categoryKey + inferItemCategory.
  -- The CASE order matches the JS short-circuit semantics: explicit enum first,
  -- then description regex for legacy `OTHER` rows.
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

-- Unique index — required by REFRESH MATERIALIZED VIEW CONCURRENTLY (hourly
-- cron /api/cron/refresh-monthly-revenue + daily /api/cron/refresh-revenue-mv).
CREATE UNIQUE INDEX monthly_revenue_mv_pk
  ON monthly_revenue_mv (year, month, category);

-- Lookup index for the common (year, month) range scan.
CREATE INDEX monthly_revenue_mv_year_month_idx
  ON monthly_revenue_mv (year, month);

-- Initial population. Subsequent refreshes via the hourly/daily crons.
-- Manual op-time action recommended after deploy: hit
-- `POST /api/admin/refresh-revenue-mv` (SUPERADMIN) so the dashboards switch
-- to the new semantic immediately instead of waiting up to 24 h for the next
-- daily refresh.
REFRESH MATERIALIZED VIEW monthly_revenue_mv;
