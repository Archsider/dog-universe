-- Split "User.name" into firstName + lastName.
-- @safety: reviewed
-- "name" stays as the auto-synced concatenation for legacy callers / display fallbacks.

ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName"  TEXT;

UPDATE "User" SET
  "firstName" = TRIM(SPLIT_PART("name", ' ', 1)),
  "lastName"  = TRIM(SUBSTRING("name" FROM POSITION(' ' IN "name") + 1));

-- Single-word names (no space): copy firstName into lastName so NOT NULL holds.
UPDATE "User" SET "lastName" = "firstName"
WHERE "lastName" = '' OR "lastName" IS NULL;

-- Catch any remaining nulls (e.g. empty name) — shouldn't happen but be safe.
UPDATE "User" SET "firstName" = COALESCE(NULLIF(TRIM("firstName"), ''), email) WHERE "firstName" IS NULL OR TRIM("firstName") = '';
UPDATE "User" SET "lastName"  = COALESCE(NULLIF(TRIM("lastName"),  ''), "firstName") WHERE "lastName"  IS NULL OR TRIM("lastName")  = '';

ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "lastName"  SET NOT NULL;
