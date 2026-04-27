-- Add soft-delete support to Booking
ALTER TABLE "Booking" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Booking_deletedAt_idx" ON "Booking"("deletedAt");
