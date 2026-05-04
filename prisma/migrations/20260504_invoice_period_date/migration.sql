ALTER TABLE "Invoice" ADD COLUMN "periodDate" TIMESTAMP(3);

-- Backfill depuis booking.startDate
UPDATE "Invoice" i
SET "periodDate" = b."startDate"
FROM "Booking" b
WHERE i."bookingId" = b."id"
  AND i."periodDate" IS NULL;
