-- Client-initiated reschedule request on a booking.
-- Replaces the legacy pattern of embedding a `[RESCHEDULE_REQUEST]{json}` tag
-- inside `Booking.notes`. Existing legacy tags are NOT migrated — admins read
-- them manually until they age out.

CREATE TABLE IF NOT EXISTS "RescheduleRequest" (
  "id"         TEXT NOT NULL,
  "bookingId"  TEXT NOT NULL,
  "startDate"  TIMESTAMP(3) NOT NULL,
  "endDate"    TIMESTAMP(3),
  "reason"     TEXT,
  "status"     TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "RescheduleRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RescheduleRequest_bookingId_key"
  ON "RescheduleRequest"("bookingId");

CREATE INDEX IF NOT EXISTS "RescheduleRequest_status_idx"
  ON "RescheduleRequest"("status");

CREATE INDEX IF NOT EXISTS "RescheduleRequest_createdAt_idx"
  ON "RescheduleRequest"("createdAt");

ALTER TABLE "RescheduleRequest"
  ADD CONSTRAINT "RescheduleRequest_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
