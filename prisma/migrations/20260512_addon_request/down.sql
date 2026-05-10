-- Rollback for 20260512_addon_request.
-- Drops the AddonRequest table (cascades indexes + FK).
DROP TABLE IF EXISTS "AddonRequest" CASCADE;
