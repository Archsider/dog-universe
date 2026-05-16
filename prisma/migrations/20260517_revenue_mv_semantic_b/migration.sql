-- Sémantique B (cash basis pure) — pivot 2026-05-17.
-- @safety: reviewed — phased migration with archive rename + rollback path
-- documented in commentaire ci-dessous.
--
-- Source : audit produit Mehdi 2026-05-17 — Sémantique A (paid-clôture)
-- ne matchait ni l'extrait bancaire ni la déclaration fiscale comptable
-- ni le "Total Encaissé" déjà affiché sur /admin/facturation. Pivot vers
-- Sémantique B (cash basis pure) : chaque Payment.amount tombe dans le
-- mois de Payment.paymentDate Casa, peu importe la date de facture / séjour.
--
-- Architecture : function PG dédiée `compute_payment_by_category` est la
-- seule source de vérité pour la formule. La MV en est juste un cache.
-- Le helper TS `src/lib/billing/monthly-revenue.ts` l'appelle aussi pour
-- le live path. Un seul endroit à modifier si la formule change.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 0 (manuel hors-tx) : REFRESH ancienne MV pour point de comparaison
-- frais avant rename. À exécuter MANUELLEMENT avant ce script :
--     REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv;
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 1 — Archive l'ancienne MV (rollback safe — RENAME, pas DROP)
-- ═══════════════════════════════════════════════════════════════════════

ALTER MATERIALIZED VIEW IF EXISTS monthly_revenue_mv
  RENAME TO monthly_revenue_mv_v1_archive_20260517;

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 2 — Function PG : single source of truth pour la formule
-- ═══════════════════════════════════════════════════════════════════════

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
    -- 1. Project Payment.paymentDate to Casa wall clock (Africa/Casablanca,
    --    UTC+1 fixed, no DST). AT TIME ZONE on a timestamptz returns
    --    timestamp without TZ in the target zone, so EXTRACT below gives
    --    Casa-anchored year/month.
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
    -- 2. For each (invoice, category) compute the allocated total + the
    --    grand total allocated on the parent invoice. Used as the ratio
    --    denominator for splitting each Payment by category (per Mehdi
    --    spec : "Chaque Payment est réparti au prorata des
    --    InvoiceItem.allocatedAmount du parent Invoice").
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
  'Sémantique B cash basis : revenue par (year, month, category). Source de vérité unique appelée par la MV monthly_revenue_mv et le helper TS src/lib/billing/monthly-revenue.ts. Si la formule change, modifier UNIQUEMENT cette fonction.';

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 3 — Nouvelle MV (cache de la function)
-- ═══════════════════════════════════════════════════════════════════════

CREATE MATERIALIZED VIEW monthly_revenue_mv AS
  SELECT * FROM compute_payment_by_category();

CREATE UNIQUE INDEX monthly_revenue_mv_year_month_cat_uq
  ON monthly_revenue_mv (year, month, category);

CREATE INDEX monthly_revenue_mv_year_month_idx
  ON monthly_revenue_mv (year, month);

COMMENT ON MATERIALIZED VIEW monthly_revenue_mv IS
  'Cash basis revenue per (year, month, category) Casa-anchored. Refreshed by cron /api/cron/refresh-monthly-revenue. The cron stamps Redis key mv:last_refresh:monthly_revenue_mv on success — the TS helper reads that to detect staleness.';

-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 4 — Stamper la migration
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO "_app_migrations" (name)
VALUES ('20260517_revenue_mv_semantic_b')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (en cas de problème prod — exécuter en 30 secondes)
-- ═══════════════════════════════════════════════════════════════════════
--
--   BEGIN;
--   DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_mv;
--   ALTER MATERIALIZED VIEW monthly_revenue_mv_v1_archive_20260517
--     RENAME TO monthly_revenue_mv;
--   DROP FUNCTION IF EXISTS compute_payment_by_category(INT, INT);
--   DELETE FROM "_app_migrations" WHERE name = '20260517_revenue_mv_semantic_b';
--   COMMIT;
--
-- L'archive est conservée 30j. Cleanup après :
--   DROP MATERIALIZED VIEW IF EXISTS monthly_revenue_mv_v1_archive_20260517;
