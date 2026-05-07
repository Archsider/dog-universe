-- Materialized view: monthly_revenue_mv
--
-- Pre-aggregates encashed revenue per (year, month, category). The join is:
--   Payment.paymentDate (the truth of "money in the till")
--     → Invoice (via payments.invoiceId)
--       → InvoiceItem (per category)
--
-- The "encashed share" of an invoice item is approximated by the item's
-- allocatedAmount column when populated, falling back to a pro-rata of the
-- payment amount over the invoice total when the allocation has not been
-- materialised yet.
--
-- A unique index on (year, month, category) is required for
-- REFRESH MATERIALIZED VIEW CONCURRENTLY (called hourly by
-- /api/cron/refresh-monthly-revenue).

DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_mv;

CREATE MATERIALIZED VIEW monthly_revenue_mv AS
SELECT
  EXTRACT(YEAR  FROM p."paymentDate")::int            AS year,
  EXTRACT(MONTH FROM p."paymentDate")::int            AS month,
  COALESCE(ii."category", 'OTHER')                    AS category,
  SUM(
    COALESCE(
      ii."allocatedAmount",
      -- Fallback: pro-rata when allocation not yet materialised.
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

-- Unique index — required by REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX monthly_revenue_mv_pk
  ON monthly_revenue_mv (year, month, category);

-- Lookup index for the common (year, month) range scan.
CREATE INDEX monthly_revenue_mv_year_month_idx
  ON monthly_revenue_mv (year, month);

-- Initial population. Subsequent refreshes are scheduled hourly via
-- /api/cron/refresh-monthly-revenue.
REFRESH MATERIALIZED VIEW monthly_revenue_mv;
