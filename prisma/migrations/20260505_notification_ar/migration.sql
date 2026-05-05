-- Add Arabic translation columns to Notification table.
-- Nullable: legacy rows created before this migration won't have an AR
-- translation; the client falls back to EN at render time.
ALTER TABLE "Notification" ADD COLUMN "titleAr" TEXT;
ALTER TABLE "Notification" ADD COLUMN "messageAr" TEXT;
