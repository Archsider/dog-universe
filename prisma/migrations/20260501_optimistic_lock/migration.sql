-- Optimistic concurrency control: add version column to Booking and Invoice.
-- Each mutation increments version; updates filter WHERE version = expected.
ALTER TABLE "Booking" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
