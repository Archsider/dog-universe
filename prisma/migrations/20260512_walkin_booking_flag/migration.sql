-- Add isWalkIn flag to Booking so walk-in reservations can be identified
-- independently of whether their User.isWalkIn is still true (e.g. if the
-- client later creates a full portal account, we still want to know this
-- booking was a walk-in entry).
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "isWalkIn" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Booking_isWalkIn_idx" ON "Booking"("isWalkIn");
