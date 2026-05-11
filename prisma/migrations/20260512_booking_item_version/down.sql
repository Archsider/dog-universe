-- Rollback H9.
ALTER TABLE "BookingItem" DROP COLUMN IF EXISTS "version";

DELETE FROM "_app_migrations" WHERE name = '20260512_booking_item_version';
