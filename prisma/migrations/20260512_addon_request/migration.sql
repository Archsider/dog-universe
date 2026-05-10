-- Client-initiated addon request on an active booking.
-- Replaces the legacy pattern of storing the request payload in
-- Notification.metadata JSON + substring-scan recovery. Legacy notifications
-- are NOT migrated — admins read them manually until they age out.

CREATE TABLE IF NOT EXISTS "AddonRequest" (
  "id"          TEXT NOT NULL,
  "bookingId"   TEXT NOT NULL,
  "petId"       TEXT,
  "serviceType" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "requestedBy" TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "reason"      TEXT,
  "resolvedBy"  TEXT,
  "resolvedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AddonRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AddonRequest_bookingId_idx"
  ON "AddonRequest"("bookingId");

CREATE INDEX IF NOT EXISTS "AddonRequest_status_idx"
  ON "AddonRequest"("status");

CREATE INDEX IF NOT EXISTS "AddonRequest_requestedBy_idx"
  ON "AddonRequest"("requestedBy");

CREATE INDEX IF NOT EXISTS "AddonRequest_createdAt_idx"
  ON "AddonRequest"("createdAt");

ALTER TABLE "AddonRequest"
  ADD CONSTRAINT "AddonRequest_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
