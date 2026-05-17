-- Rollback : restore the pre-patch `compute_payment_by_category` body
-- (the original from 20260517_revenue_mv_semantic_b/migration.sql) and
-- refresh the MV.
--
-- NOTE : the original definition has a real TZ bug — it treats
-- TIMESTAMP(3) naive values as if they were already Casa-anchored.
-- Rolling back re-introduces that bug. Only use this in an emergency
-- where the patched function has a worse downside than the original
-- drift.

BEGIN;

CREATE OR REPLACE FUNCTION compute_payment_by_category(
  target_year  INT DEFAULT NULL,
  target_month INT DEFAULT NULL
)
RETURNS TABLE (
  year     INT,
  month    INT,
  category TEXT,
  total    NUMERIC(12, 2)
)
LANGUAGE sql
STABLE
AS $$
  WITH casa_payment AS (
    SELECT
      p.id                                              AS payment_id,
      p."paymentDate" AT TIME ZONE 'Africa/Casablanca'  AS casa_date,
      p.amount                                          AS payment_amount,
      p."invoiceId"                                     AS invoice_id
    FROM "Payment" p
    WHERE
      (target_year  IS NULL OR EXTRACT(YEAR  FROM (p."paymentDate" AT TIME ZONE 'Africa/Casablanca'))::int = target_year)
      AND
      (target_month IS NULL OR EXTRACT(MONTH FROM (p."paymentDate" AT TIME ZONE 'Africa/Casablanca'))::int = target_month)
  ),
  invoice_alloc AS (
    SELECT
      ii."invoiceId",
      ii.category,
      SUM(ii."allocatedAmount")                                                  AS cat_alloc,
      SUM(SUM(ii."allocatedAmount")) OVER (PARTITION BY ii."invoiceId")          AS inv_alloc_total
    FROM "InvoiceItem" ii
    WHERE ii."allocatedAmount" > 0
    GROUP BY ii."invoiceId", ii.category
  )
  SELECT
    EXTRACT(YEAR  FROM cp.casa_date)::int                  AS year,
    EXTRACT(MONTH FROM cp.casa_date)::int                  AS month,
    LOWER(ia.category::text)                               AS category,
    SUM(
      ROUND(
        (cp.payment_amount * ia.cat_alloc / NULLIF(ia.inv_alloc_total, 0))::numeric,
        2
      )
    )::numeric(12, 2)                                      AS total
  FROM casa_payment cp
  JOIN "Invoice" i      ON i.id = cp.invoice_id
  JOIN invoice_alloc ia ON ia."invoiceId" = i.id
  WHERE NOT (i.status = 'CANCELLED' AND i."paidAmount" = 0)
  GROUP BY year, month, category;
$$;

REFRESH MATERIALIZED VIEW monthly_revenue_mv;

DELETE FROM "_app_migrations" WHERE name = '20260518_audit_tz_casa_fixes';

COMMIT;
