-- Soft-delete: add deletedAt to User and Pet
-- Pet already has deletedAt in the schema (code-level), this migration adds it
-- to User. Pet column was added in an earlier migration but is included here
-- for completeness in case it is missing in any environment.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Pet" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_deletedAt_idx" ON "User"("deletedAt");
