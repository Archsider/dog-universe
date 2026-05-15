-- monthly_revenue_mv — Bug A : exclude CANCELLED invoices from the source CTE.
--
-- Previous definition (20260515_revenue_mv_semantic_a) joined Invoice +
-- Payment without filtering on `i.status`. CANCELLED invoices that had
-- payments in their lifetime (paid then cancelled, no refund row) were
-- counted by the MV's `closed_invoices` gate but ignored by the JS path
-- (which filters `status: { in: ['PAID', 'PARTIALLY_PAID', 'PENDING'] }`).
-- That asymmetry produced false-positive `js_vs_mv_current_month` flags
-- on /admin/guardian/invariants and inflated the dashboard "CA boarding"
-- by every CANCELLED full-paid invoice of the month.
--
-- This migration adds `AND i.status != 'CANCELLED'` to the
-- `invoice_paid_status` CTE. Bug A's PR also aligns the JS path to mirror
-- this exact filter, so both sides now see the same source data.
--
-- IMPACT : dashboards reading `monthly_revenue_mv` (admin analytics +
-- /admin/billing KPIs) will drop by the sum of CANCELLED full-paid
-- invoices per month. Expected — those invoices represent nullified
-- revenue (refunds, cancellations), not real CA.
--
-- The rest of the MV (bucket inference, gate tolerance, REFRESH path)
-- is byte-identical to 20260515_revenue_mv_semantic_a.

DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_mv;

CREATE MATERIALIZED VIEW monthly_revenue_mv AS
WITH invoice_paid_status AS (
  -- Per invoice: total paid + last payment date. Excludes invoices with no
  -- payments at all (a PENDING-only invoice has no contribution under A).
  -- Bug A : excludes CANCELLED invoices — nullified revenue stays out of
  -- the per-category breakdown. Matches the JS path filter
  -- `status: { not: 'CANCELLED' }`.
  SELECT
    i."id"                        AS invoice_id,
    i."amount"                    AS invoice_amount,
    SUM(p."amount")               AS paid_total,
    MAX(p."paymentDate")          AS last_paid_at
  FROM "Invoice"  i
  JOIN "Payment"  p ON p."invoiceId" = i."id"
  WHERE p."paymentDate" IS NOT NULL
    AND i."status" != 'CANCELLED'
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
-- `POST /api/admin/refresh-revenue-mv` (SUPERADMIN) so the dashboards
-- pick up the new semantic immediately instead of waiting up to an hour
-- for the next scheduled refresh.
REFRESH MATERIALIZED VIEW monthly_revenue_mv;
