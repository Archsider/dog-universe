-- @safety: reviewed — single-statement CREATE OR REPLACE FUNCTION + REFRESH MV.
-- @rollback: see down.sql (restores the pre-fix function definition)
--
-- Bug TZ round 3 — `compute_payment_by_category` mis-buckets payments
-- whose `paymentDate` (timestamp without time zone) is stored as UTC.
--
-- ── Root cause ───────────────────────────────────────────────────────────
-- `Payment.paymentDate` column is `timestamp WITHOUT time zone`. The
-- JS / Prisma layer writes Date objects whose ISO representation is UTC
-- (e.g. user clicks "1 mai 2026" in the date picker → `new Date('2026-
-- 05-01')` = `2026-05-01T00:00:00Z` UTC → Prisma strips the timezone →
-- DB stores naive `2026-05-01 00:00:00`).
--
-- The previous function applied `AT TIME ZONE 'Africa/Casablanca'` on
-- this naive timestamp. In Postgres semantics, `naive AT TIME ZONE 'X'`
-- means "interpret this naive as if it were local time in zone X, return
-- the corresponding UTC timestamptz". So `2026-05-01 00:00:00` was
-- treated as Casa midnight, converted to `2026-04-30 23:00:00+00 UTC`,
-- then EXTRACT(MONTH ...) on a UTC timestamptz with session UTC returned
-- 4 (April) — bucketing the payment in the wrong month.
--
-- ── Fix ─────────────────────────────────────────────────────────────────
-- Apply `AT TIME ZONE 'UTC'` first to tell Postgres "this naive IS UTC,
-- give me the UTC timestamptz", then `AT TIME ZONE 'Africa/Casablanca'`
-- to convert that to Casa local naive timestamp. EXTRACT on the naive
-- Casa result returns the intended Casa calendar month.
--
-- Concretely : `2026-05-01 00:00:00` (UTC stored as naive)
--   → AT TIME ZONE 'UTC'                  → `2026-05-01 00:00:00+00`
--   → AT TIME ZONE 'Africa/Casablanca'    → `2026-05-01 01:00:00` (naive Casa)
--   → EXTRACT(MONTH FROM ...)             → 5 (May) ✅
--
-- ── Impact on historical data ───────────────────────────────────────────
-- Every payment with `paymentDate` between `YYYY-MM-DD 23:00:00+00` and
-- `YYYY-(MM+1)-01 00:00:00+00` (= 00:00-01:00 Casa next day) was
-- previously bucketed in the wrong month. Date-picker inputs (date-only,
-- midnight UTC) at the 1st-of-month boundary are the primary case.
-- After this fix + REFRESH, `monthly_revenue_mv` re-buckets correctly
-- and `payment_attribution_drift` invariant turns green.
--
-- DU-2026-0033 (1950 MAD, paymentDate `2026-05-01 00:00:00` UTC) was
-- bucketed in April → now correctly bucketed in May. The April 2026
-- "boarding" total drops by 1950, May 2026 gains 1950. Same intent as
-- the user's UI input. Other months may shift similarly for analogous
-- boundary payments.

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
      p.id                                                                       AS payment_id,
      (p."paymentDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca'      AS casa_date,
      p.amount                                                                    AS payment_amount,
      p."invoiceId"                                                               AS invoice_id
    FROM public."Payment" p
    WHERE
      (target_year  IS NULL OR EXTRACT(YEAR  FROM ((p."paymentDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca'))::int = target_year)
      AND
      (target_month IS NULL OR EXTRACT(MONTH FROM ((p."paymentDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca'))::int = target_month)
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

-- Refresh the MV so the corrected function is reflected in the cached
-- view immediately. CONCURRENTLY requires a UNIQUE index (it exists from
-- 20260517_revenue_mv_semantic_b). REFRESH is a no-op-safe operation
-- (always rebuilds the MV from the function).
REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv;

INSERT INTO "_app_migrations" (name)
VALUES ('20260518_fix_function_tz_casa')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- ── Post-deploy verification ──────────────────────────────────────────────
--   SELECT SUM(p.amount) AS raw_payment
--     FROM "Payment" p
--     WHERE (p."paymentDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca' >= '2026-05-01'
--       AND (p."paymentDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Casablanca' <  '2026-06-01';
--   → must equal SUM(total) FROM monthly_revenue_mv WHERE year=2026 AND month=5.
--
-- ── Rollback ──────────────────────────────────────────────────────────────
-- See down.sql for restoring the previous (buggy) function. DO NOT
-- rollback unless an unexpected regression appears in production — the
-- bug being fixed is a permanent data correctness issue.
