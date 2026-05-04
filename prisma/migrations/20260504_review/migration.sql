-- Migration: add Review model for post-stay NPS/avis
-- Run on Supabase: psql $DATABASE_URL -f migration.sql

CREATE TABLE IF NOT EXISTS "Review" (
  "id"        TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "rating"    INTEGER NOT NULL,
  "comment"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Review_bookingId_key" ON "Review"("bookingId");
CREATE INDEX IF NOT EXISTS "Review_clientId_idx" ON "Review"("clientId");
CREATE INDEX IF NOT EXISTS "Review_createdAt_idx" ON "Review"("createdAt");

-- FK constraints
ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_bookingId_fkey";
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_clientId_fkey";
ALTER TABLE "Review" ADD CONSTRAINT "Review_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
