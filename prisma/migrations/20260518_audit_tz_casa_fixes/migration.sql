-- Audit TZ Casa — fix `compute_payment_by_category` to interpret naive
-- timestamps as UTC before projecting to Africa/Casablanca.
-- @safety: reviewed — function replacement, no data write.
--
-- Bug pattern
-- ───────────
-- `Payment.paymentDate` is Prisma `DateTime` (no `@db.Timestamptz`), so PG
-- stores it as `TIMESTAMP(3)` (naive — no timezone metadata). The Node
-- driver writes UTC instants into that naive column. When the function
-- then runs `paymentDate AT TIME ZONE 'Africa/Casablanca'`, Postgres
-- *interprets the naive value as if it were already a Casa wall clock*
-- (session TZ) and converts to timestamptz — producing a wrong instant.
--
-- The correct projection for "treat this naive value as UTC and give me
-- the Casa wall clock" is :
--
--     paymentDate AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Casablanca'
--
-- Step 1 says "this naive timestamp is UTC" (yields timestamptz). Step 2
-- says "project that instant to Casa wall clock" (yields naive in target
-- zone). EXTRACT(YEAR/MONTH) on the result then gives Casa-anchored
-- values, immune to the session TZ of the running connection.
--
-- Without this fix, payments stamped between 23:00 and 23:59 UTC (which
-- are already next-day in Casa, UTC+1) would have been attributed to
-- the wrong Casa-month at month boundaries. Production impact is
-- low-volume (Mehdi typically encaisses during day hours Casa-local),
-- but the function is the canonical source of truth for revenue
-- attribution — silent drift here invalidates invariants #11 / #12 and
-- every downstream KPI.
--
-- Idempotent : CREATE OR REPLACE FUNCTION.

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
    -- Payment.paymentDate is TIMESTAMP(3) (naive) storing UTC instants.
    -- Step 1: `AT TIME ZONE 'UTC'` says "this naive value is UTC"
    --         → yields timestamptz.
    -- Step 2: `AT TIME ZONE 'Africa/Casablanca'` projects that timestamptz
    --         to the Casa wall clock → yields naive in target zone.
    -- EXTRACT then reads Casa-anchored year/month, immune to session TZ.
    SELECT
      p.id                                                                        AS payment_id,
      (p."paymentDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Casablanca')       AS casa_date,
      p.amount                                                                    AS payment_amount,
      p."invoiceId"                                                               AS invoice_id
    FROM "Payment" p
    WHERE
      (target_year  IS NULL OR EXTRACT(YEAR  FROM (p."paymentDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Casablanca'))::int = target_year)
      AND
      (target_month IS NULL OR EXTRACT(MONTH FROM (p."paymentDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Casablanca'))::int = target_month)
  ),
  invoice_alloc AS (
    -- For each (invoice, category) compute the allocated total + the
    -- grand total allocated on the parent invoice. Ratio denominator
    -- for splitting each Payment by category (Mehdi spec : prorata of
    -- InvoiceItem.allocatedAmount on the parent Invoice).
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
  -- CANCELLED + paidAmount=0 → exclu (rien à compter)
  -- CANCELLED + paidAmount>0 → conservé (revenu acquis, refund acté en
  --   Payment négatif si remboursement physique au client)
  WHERE NOT (i.status = 'CANCELLED' AND i."paidAmount" = 0)
  GROUP BY year, month, category;
$$;

COMMENT ON FUNCTION compute_payment_by_category(INT, INT) IS
  'Sémantique B cash basis : revenue par (year, month, category). Source de vérité unique appelée par la MV monthly_revenue_mv et le helper TS src/lib/billing/monthly-revenue.ts. Si la formule change, modifier UNIQUEMENT cette fonction. PATCH 2026-05-18 : double AT TIME ZONE (UTC then Casa) to correctly project naive TIMESTAMP(3) UTC instants to Casa wall clock.';

-- Refresh the MV so it reflects the patched function. Must use REFRESH
-- (not CONCURRENTLY here — the migration is wrapped in a transaction
-- and CONCURRENTLY cannot run in a tx). Tables are small enough that a
-- non-concurrent refresh is sub-second.
REFRESH MATERIALIZED VIEW monthly_revenue_mv;

INSERT INTO "_app_migrations" (name)
VALUES ('20260518_audit_tz_casa_fixes')
ON CONFLICT (name) DO NOTHING;

COMMIT;
