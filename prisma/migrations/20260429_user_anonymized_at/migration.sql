-- RGPD: anonymization timestamp on User
-- Idempotent: column may already exist in prod from earlier manual SQL
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3);
