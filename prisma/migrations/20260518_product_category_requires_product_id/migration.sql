-- @safety: reviewed — defense-in-depth DB-level guard for InvoiceItem.category='PRODUCT'.
-- A row with category='PRODUCT' must reference a Product (productId NOT NULL).
-- This is the final floor when the Zod refinement + UI fail to catch a write.
--
-- ── Layered defense (top → bottom) ────────────────────────────────────────
--   1. ESLint rule  `dog-universe/no-hardcoded-product-without-id`
--      → blocks merging code that hardcodes `category: 'PRODUCT'` without
--        a `productId` key in the same ObjectExpression literal.
--   2. Zod refine  `PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID`
--      → POST /api/invoices, POST /api/admin/walkin-invoice, PATCH
--        /api/invoices/[id] reject the body at the API boundary with 400.
--   3. DB CHECK    `InvoiceItem_product_category_has_productId` (this file)
--      → Postgres rejects the INSERT/UPDATE with constraint_violation. Last
--        line of defense — catches code paths bypassing Zod (raw SQL, future
--        admin scripts, manual fixes via psql).
--
-- ── Two-step plan ─────────────────────────────────────────────────────────
--   STEP 1 — data cleanup (idempotent UPDATEs).
--   STEP 2 — CHECK constraint creation (DO block, idempotent).
--
-- ── Data cleanup strategy ─────────────────────────────────────────────────
-- STEP 1.a uses the Product catalogue itself to recover the productId when
-- a legacy item description matches a known product name. Mirror of the
-- catalogue → safer than regex keyword matching (only links to a real row
-- that exists today). Avoids the false-positive risk of plain ILIKE on
-- common words.
--
-- STEP 1.b is a defensive backfill : for items already tagged category=
-- 'PRODUCT' with NULL productId, try the same name-lookup.
--
-- STEP 1.c is the safety net : any remaining PRODUCT-without-productId row
-- is downgraded to category='OTHER' with a note prepended to the description.
-- Better to lose category than break the migration ; the row remains visible
-- in the dashboard and the admin can re-classify manually.
--
-- ── Idempotency ───────────────────────────────────────────────────────────
-- All UPDATEs are guarded so re-running the migration is a no-op (rows
-- already corrected don't match the WHERE clause). The CHECK constraint
-- creation is wrapped in a DO block that skips if `conname` already exists.
-- Re-applies cleanly on partial failure / retry.

BEGIN;

-- STEP 1.a — Recover productId from Product catalogue by name lookup.
-- Match the longest product name first to avoid sub-word collisions
-- ("Nexgard" matches "Nexgard Spectra" first thanks to ORDER BY length).
WITH ranked_match AS (
  SELECT
    ii.id AS item_id,
    p.id AS product_id,
    ROW_NUMBER() OVER (
      PARTITION BY ii.id
      ORDER BY LENGTH(p.name) DESC, p.id
    ) AS rn
  FROM "InvoiceItem" ii
  JOIN "Product" p
    ON LOWER(ii.description) LIKE '%' || LOWER(p.name) || '%'
  WHERE ii."productId" IS NULL
    AND ii.category IN ('OTHER', 'PRODUCT')
)
UPDATE "InvoiceItem" ii
SET "productId" = rm.product_id,
    category    = 'PRODUCT'
FROM ranked_match rm
WHERE ii.id = rm.item_id
  AND rm.rn = 1;

-- STEP 1.b — Defensive : any 'PRODUCT'-tagged item still missing
-- productId at this point — try again (already covered by 1.a but kept
-- as a guard for the case where category was set without going through
-- the recovery branch).
WITH ranked_match AS (
  SELECT
    ii.id AS item_id,
    p.id AS product_id,
    ROW_NUMBER() OVER (
      PARTITION BY ii.id
      ORDER BY LENGTH(p.name) DESC, p.id
    ) AS rn
  FROM "InvoiceItem" ii
  JOIN "Product" p
    ON LOWER(ii.description) LIKE '%' || LOWER(p.name) || '%'
  WHERE ii."productId" IS NULL
    AND ii.category = 'PRODUCT'
)
UPDATE "InvoiceItem" ii
SET "productId" = rm.product_id
FROM ranked_match rm
WHERE ii.id = rm.item_id
  AND rm.rn = 1;

-- STEP 1.c — Safety net. Any remaining category='PRODUCT' with NULL
-- productId is one that the catalogue lookup could not resolve (e.g.
-- typo, discontinued product, brand-name-only description). Downgrade
-- to 'OTHER' with an audit prefix in description so an admin can
-- re-classify manually. Without this fallback STEP 2 would fail
-- on the CHECK creation.
UPDATE "InvoiceItem"
SET category = 'OTHER',
    description = '[Auto-fix 2026-05-18] Original: PRODUCT without productId — ' || description
WHERE category = 'PRODUCT'
  AND "productId" IS NULL;

-- STEP 2 — Add the CHECK constraint. Idempotent via pg_constraint guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'InvoiceItem_product_category_has_productId'
  ) THEN
    ALTER TABLE "InvoiceItem"
      ADD CONSTRAINT "InvoiceItem_product_category_has_productId"
      CHECK (category != 'PRODUCT' OR "productId" IS NOT NULL);
  END IF;
END $$;

INSERT INTO "_app_migrations" (name)
VALUES ('20260518_product_category_requires_product_id')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- ── Post-deploy verification ──────────────────────────────────────────────
--   SELECT COUNT(*) FROM "InvoiceItem"
--     WHERE category = 'PRODUCT' AND "productId" IS NULL;
--   → must return 0.
--
--   SELECT id, description FROM "InvoiceItem"
--     WHERE description LIKE '[Auto-fix 2026-05-18]%';
--   → manually re-classify each one (admin UI : edit invoice → fix line).
--
-- ── Rollback ──────────────────────────────────────────────────────────────
-- DROP CONSTRAINT only — STEP 1 data changes are intentionally one-way.
-- See down.sql.
