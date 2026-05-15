-- Rollback to the pre-2026-05-15 pro-rata MV.
-- Source: prisma/migrations/20260509_monthly_revenue_mv/migration.sql.
--
-- Running this brings back the centime-fractional drift (rolls Rita's case
-- to ~4.26 MAD grooming in May again). Acceptable because the application
-- code rollback would also revert `computeMonthlyRevenueByCategory` to its
-- pre-A FIFO behaviour — the two halves of the rollback ARE consistent
-- with each other, even though they drift from sémantique A.

DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_mv;

CREATE MATERIALIZED VIEW monthly_revenue_mv AS
SELECT
  EXTRACT(YEAR  FROM p."paymentDate")::int            AS year,
  EXTRACT(MONTH FROM p."paymentDate")::int            AS month,
  COALESCE(ii."category", 'OTHER')                    AS category,
  SUM(
    COALESCE(
      ii."allocatedAmount",
      ii."total" * (p."amount" / NULLIF(i."amount", 0))
    )
  )::numeric(14,2)                                    AS total,
  COUNT(DISTINCT i."id")::int                         AS "invoiceCount"
FROM "Payment"      p
JOIN "Invoice"      i  ON i."id"        = p."invoiceId"
JOIN "InvoiceItem"  ii ON ii."invoiceId" = i."id"
WHERE p."paymentDate" IS NOT NULL
GROUP BY 1, 2, 3
WITH NO DATA;

CREATE UNIQUE INDEX monthly_revenue_mv_pk
  ON monthly_revenue_mv (year, month, category);

CREATE INDEX monthly_revenue_mv_year_month_idx
  ON monthly_revenue_mv (year, month);

REFRESH MATERIALIZED VIEW monthly_revenue_mv;
