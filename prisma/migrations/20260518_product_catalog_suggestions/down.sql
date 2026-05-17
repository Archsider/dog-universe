-- Rollback for 20260518_product_catalog_suggestions.
-- Drops the table cascading — pending suggestions are NOT business-critical
-- (regenerated next cron tick if invoice rows still match).

BEGIN;

DROP TABLE IF EXISTS "ProductCatalogSuggestion" CASCADE;

COMMIT;
