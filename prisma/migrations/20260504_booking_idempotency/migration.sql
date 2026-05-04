-- Migration: 20260504_booking_idempotency
-- Adds a deterministic idempotency key on Booking to prevent duplicate bookings
-- (same client + dates + pets), and enforces 1 invoice max per booking at DB level.

-- 1. Add idempotencyKey column on Booking (nullable, unique)
ALTER TABLE "Booking" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_idempotencyKey_key" UNIQUE ("idempotencyKey");

-- 2. Enforce 1 invoice max per booking (Invoice.bookingId is already UNIQUE in Prisma
--    schema via @unique, but we make the SQL constraint explicit for safety).
--    Note: Invoice.bookingId is already UNIQUE (added by Prisma migration). This is a
--    no-op if the constraint already exists, otherwise it adds the safety net.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Invoice_bookingId_key' AND contype = 'u'
  ) THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bookingId_key" UNIQUE ("bookingId");
  END IF;
END $$;
