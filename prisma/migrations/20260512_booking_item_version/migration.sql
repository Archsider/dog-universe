-- H9 — Optimistic lock on BookingItem.
-- Used together with Booking.version to detect concurrent product mutations
-- on the same booking (admin A adds croquette, admin B deletes a line at
-- the same instant — second writer must lose with a 409).
ALTER TABLE "BookingItem" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "_app_migrations"(name) VALUES ('20260512_booking_item_version') ON CONFLICT DO NOTHING;
