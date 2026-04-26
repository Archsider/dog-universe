-- AlterTable: Add source field to Booking
-- "ONLINE" = created by client via app
-- "MANUAL" = created by admin on behalf of client (WhatsApp, phone, walk-in)
-- NULL = legacy bookings created before this field existed

ALTER TABLE "Booking" ADD COLUMN "source" TEXT;
