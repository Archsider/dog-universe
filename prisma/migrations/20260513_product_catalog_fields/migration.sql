-- Product catalogue extension (admin only).
-- Idempotent: safe to re-run, no destructive change.
-- @safety: reviewed
-- @rollback: see down.sql

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "description"        TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "costPrice"          DECIMAL(10, 2);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "lowStockThreshold"  INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isArchived"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "version"            INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Product_isArchived_idx" ON "Product"("isArchived");
