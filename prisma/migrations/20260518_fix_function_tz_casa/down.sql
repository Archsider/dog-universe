-- Rollback : restore the previous (buggy) compute_payment_by_category
-- function. Use ONLY if the fix introduces an unexpected regression —
-- the bug being fixed (Casa TZ mis-bucketing) is a permanent data
-- correctness issue. After rollback, `payment_attribution_drift`
-- invariant will flag again on every month that has a date-picker
-- payment at the 1st-of-month boundary.

BEGIN;

CREATE OR REPLACE FUNCTION public.compute_payment_by_category(
  target_year  integer DEFAULT NULL::integer,
  target_month integer DEFAULT NULL::integer
)
 RETURNS TABLE(year integer, month integer, category text, total numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH casa_payment AS (
    SELECT
      p.id                                              AS payment_id,
      p."paymentDate" AT TIME ZONE 'Africa/Casablanca'  AS casa_date,
      p.amount                                          AS payment_amount,
      p."invoiceId"                                     AS invoice_id
    FROM public."Payment" p
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
    FROM public."InvoiceItem" ii
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
  JOIN public."Invoice" i      ON i.id = cp.invoice_id
  JOIN invoice_alloc ia        ON ia."invoiceId" = i.id
  WHERE NOT (i.status = 'CANCELLED' AND i."paidAmount" = 0)
  GROUP BY year, month, category;
$function$;

REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv;

DELETE FROM "_app_migrations" WHERE name = '20260518_fix_function_tz_casa';

COMMIT;
