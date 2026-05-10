-- Feature flags interne (homemade, DB-backed, Redis-cached 60s).
-- Activation par % rollout (sticky par hash(userId+key)), par rôle, ou
-- par userId whitelist. `enabled = false` = kill-switch global.

CREATE TABLE IF NOT EXISTS "FeatureFlag" (
  "key"            TEXT NOT NULL,
  "description"    TEXT NOT NULL DEFAULT '',
  "enabled"        BOOLEAN NOT NULL DEFAULT false,
  "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
  "targetRoles"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "userWhitelist"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "FeatureFlag_rolloutPercent_check" CHECK ("rolloutPercent" >= 0 AND "rolloutPercent" <= 100)
);

-- Seed deux flags d'exemple (idempotent).
INSERT INTO "FeatureFlag" ("key", "description", "enabled", "rolloutPercent", "targetRoles", "userWhitelist")
VALUES
  ('ai-recommendations', 'Recommandations IA produits/services (kill-switch)', false, 0,   ARRAY[]::TEXT[], ARRAY[]::TEXT[]),
  ('new-billing-ui',     'Nouvelle UI facturation (rollout progressif)',       true,  0,   ARRAY['SUPERADMIN'], ARRAY[]::TEXT[])
ON CONFLICT ("key") DO NOTHING;
