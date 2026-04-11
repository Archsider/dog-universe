-- Migration: 20260411_pending_extension
-- Adds extensionForBookingId to Booking model to link PENDING_EXTENSION bookings
-- to the original booking they are extending.

ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "extensionForBookingId" TEXT;

-- Index for fast lookup of pending extensions by original booking
CREATE INDEX IF NOT EXISTS "Booking_extensionForBookingId_idx" ON "Booking"("extensionForBookingId");
