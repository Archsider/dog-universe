-- @rollback: not-applicable
-- @safety: reviewed — data normalization, idempotent.
--
-- Normalises legacy InvoiceItem rows persisted with category='OTHER'
-- whose descriptions match the same keyword patterns that
-- `inferItemCategory(category, description)` in src/lib/category.ts
-- already uses at the JS layer. Until 2026-05-17 the JS path
-- (Sémantique A) silently re-classified these rows on read ; the MV
-- path (Sémantique B, PR #105 pivot) reads raw `ii.category` so the
-- mismatch surfaces as a permanent `js_vs_mv_current_month` flag.
--
-- Fixing the data at rest aligns both sides and eliminates the
-- invariant noise. The companion code change deletes the now-redundant
-- `checkJsVsMvCurrentMonth` invariant (#11 + #12 already cover both
-- semantic-B sources).
--
-- ── Why ILIKE and not POSIX regex (~*)? ─────────────────────────────
-- `categoryKey()` uses `String.prototype.includes()` (case-insensitive
-- via `.toLowerCase()`) — substring match, no word boundary. ILIKE
-- '%keyword%' is the exact SQL equivalent. POSIX regex with `\m...\M`
-- would tighten the match but would diverge from the JS rule, defeating
-- the goal of strict parity.
--
-- ── Idempotency ─────────────────────────────────────────────────────
-- All UPDATE statements are guarded by `WHERE category = 'OTHER'`. A
-- re-run sees `category != 'OTHER'` on already-normalized rows and is
-- a no-op. Safe to apply multiple times.
--
-- ── Order matters ───────────────────────────────────────────────────
-- The JS `categoryKey()` evaluates in order : boarding → taxi →
-- grooming → croquettes → OTHER. First match wins. We replicate that
-- short-circuit by running the UPDATEs in the same order — each later
-- statement only touches rows still on `OTHER`.

BEGIN;

-- 1. BOARDING — keywords: pension / boarding / nuit / hébergement
UPDATE "InvoiceItem"
SET category = 'BOARDING'
WHERE category = 'OTHER'
  AND (
    description ILIKE '%pension%'
    OR description ILIKE '%boarding%'
    OR description ILIKE '%nuit%'
    OR description ILIKE '%hébergement%'
  );

-- 2. PET_TAXI — keywords: taxi / transport / aller / retour
UPDATE "InvoiceItem"
SET category = 'PET_TAXI'
WHERE category = 'OTHER'
  AND (
    description ILIKE '%taxi%'
    OR description ILIKE '%transport%'
    OR description ILIKE '%aller%'
    OR description ILIKE '%retour%'
  );

-- 3. GROOMING — keywords: toilettage / grooming / soin / bain / coupe
UPDATE "InvoiceItem"
SET category = 'GROOMING'
WHERE category = 'OTHER'
  AND (
    description ILIKE '%toilettage%'
    OR description ILIKE '%grooming%'
    OR description ILIKE '%soin%'
    OR description ILIKE '%bain%'
    OR description ILIKE '%coupe%'
  );

-- 4. PRODUCT — keywords: croquette / kibble / nourriture / royal / grain
UPDATE "InvoiceItem"
SET category = 'PRODUCT'
WHERE category = 'OTHER'
  AND (
    description ILIKE '%croquette%'
    OR description ILIKE '%kibble%'
    OR description ILIKE '%nourriture%'
    OR description ILIKE '%royal%'
    OR description ILIKE '%grain%'
  );

-- 5. Defensive backfill — any remaining OTHER row linked to a Product
-- via productId is, by the resolveItemCategory invariant, a PRODUCT
-- item. This should be 0 rows in practice (the trigger / Zod schema
-- enforces it at write time), but the fix is cheap and idempotent.
UPDATE "InvoiceItem"
SET category = 'PRODUCT'
WHERE category = 'OTHER'
  AND "productId" IS NOT NULL;

INSERT INTO "_app_migrations" (name) VALUES ('20260518_normalize_legacy_other_categories')
  ON CONFLICT (name) DO NOTHING;

COMMIT;

-- ── Post-deploy verification ────────────────────────────────────────
-- Once applied, `/admin/health` should green-light invariants #11
-- (payment_attribution_drift) and #12 (revenue_helper_vs_live) — both
-- already mirror the same Payment-anchored data on MV vs PG function
-- paths. The deleted `js_vs_mv_current_month` (#10) was the only
-- consumer that re-applied the JS inferItemCategory fallback.
--
-- Sanity query :
--   SELECT category, COUNT(*) FROM "InvoiceItem"
--     WHERE category = 'OTHER' GROUP BY category;
-- → returns only legitimate OTHER rows (free-text "frais divers",
-- adjustment lines, etc.).
