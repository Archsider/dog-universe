-- Migration: Add BookingItem table for admin-defined extra billing lines
-- Run on Supabase via the SQL editor

CREATE TABLE IF NOT EXISTS "BookingItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BookingItem_bookingId_idx" ON "BookingItem"("bookingId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BookingItem_bookingId_fkey'
  ) THEN
    ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey"
      FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
