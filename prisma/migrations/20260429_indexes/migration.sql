-- Index audit — added to optimize hot paths identified in code review.
-- All indexes use CREATE INDEX IF NOT EXISTS so re-running on a partially
-- migrated database is safe.
--
-- Use CONCURRENTLY in production to avoid blocking writes; CONCURRENTLY
-- cannot run inside a transaction block (Prisma migrate runs in TX), so if
-- you apply this through `prisma migrate deploy` PostgreSQL will use a
-- short ACCESS EXCLUSIVE lock — fine for tables under ~100k rows. For
-- larger tables, run the CONCURRENTLY versions manually via psql.

-- Booking : capacity overlap query needs endDate; admin orderings need
-- createdAt; capacity filter on serviceType is a hot path.
CREATE INDEX IF NOT EXISTS "Booking_endDate_idx"     ON "Booking" ("endDate");
CREATE INDEX IF NOT EXISTS "Booking_createdAt_idx"   ON "Booking" ("createdAt");
CREATE INDEX IF NOT EXISTS "Booking_serviceType_idx" ON "Booking" ("serviceType");

-- BookingPet : petId-only filter used when checking active bookings before
-- a pet is soft-deleted. The existing @@unique([bookingId, petId]) covers
-- bookingId only on its leading column.
CREATE INDEX IF NOT EXISTS "BookingPet_petId_idx" ON "BookingPet" ("petId");

-- Invoice : list views order by createdAt desc.
CREATE INDEX IF NOT EXISTS "Invoice_createdAt_idx" ON "Invoice" ("createdAt");

-- Notification : list view orders by createdAt; the unread-count badge
-- queried on every page load benefits from a composite (userId, read).
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx"   ON "Notification" ("createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification" ("userId", "read");
