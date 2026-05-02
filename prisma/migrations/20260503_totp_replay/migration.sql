-- TOTP replay-attack defence: persist last-used token + timestamp on User.
-- A successful verify() inside a 90s window for the same token is rejected.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastTotpToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastTotpUsedAt" TIMESTAMP WITH TIME ZONE;
