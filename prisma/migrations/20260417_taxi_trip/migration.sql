-- ── TaxiTrip + TaxiStatusHistory ─────────────────────────────────────────────
-- Replaces flat taxiGoStatus / taxiReturnStatus columns on BoardingDetail
-- and introduces a unified TaxiTrip model for both addon and standalone trips.

-- 1. Create TaxiTrip table
CREATE TABLE "TaxiTrip" (
  "id"        TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "tripType"  TEXT NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'PLANNED',
  "date"      TEXT,
  "time"      TEXT,
  "address"   TEXT,
  "taxiType"  TEXT,
  "price"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxiTrip_pkey" PRIMARY KEY ("id")
);

-- 2. Create TaxiStatusHistory table
CREATE TABLE "TaxiStatusHistory" (
  "id"         TEXT NOT NULL,
  "taxiTripId" TEXT NOT NULL,
  "status"     TEXT NOT NULL,
  "timestamp"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxiStatusHistory_pkey" PRIMARY KEY ("id")
);

-- 3. Foreign keys
ALTER TABLE "TaxiTrip"
  ADD CONSTRAINT "TaxiTrip_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaxiStatusHistory"
  ADD CONSTRAINT "TaxiStatusHistory_taxiTripId_fkey"
  FOREIGN KEY ("taxiTripId") REFERENCES "TaxiTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Indexes
CREATE INDEX "TaxiTrip_bookingId_idx" ON "TaxiTrip"("bookingId");
CREATE INDEX "TaxiStatusHistory_taxiTripId_idx" ON "TaxiStatusHistory"("taxiTripId");

-- 5. Migrate standalone PET_TAXI bookings (TaxiDetail → TaxiTrip STANDALONE)
INSERT INTO "TaxiTrip" ("id", "bookingId", "tripType", "status", "date", "time", "taxiType", "price", "createdAt", "updatedAt")
SELECT
  'trip_' || td."id",
  td."bookingId",
  'STANDALONE',
  CASE WHEN b."status" = 'COMPLETED' THEN 'ARRIVED_AT_PENSION' ELSE 'PLANNED' END,
  TO_CHAR(b."startDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
  b."arrivalTime",
  td."taxiType",
  td."price",
  NOW(),
  NOW()
FROM "TaxiDetail" td
JOIN "Booking" b ON b."id" = td."bookingId";

-- 6. Migrate boarding addon OUTBOUND (taxiGoEnabled = true)
INSERT INTO "TaxiTrip" ("id", "bookingId", "tripType", "status", "date", "time", "address", "createdAt", "updatedAt")
SELECT
  'trip_go_' || bd."bookingId",
  bd."bookingId",
  'OUTBOUND',
  CASE WHEN bd."taxiGoStatus" = 'COMPLETED' THEN 'ARRIVED_AT_PENSION' ELSE 'PLANNED' END,
  bd."taxiGoDate",
  bd."taxiGoTime",
  bd."taxiGoAddress",
  NOW(),
  NOW()
FROM "BoardingDetail" bd
WHERE bd."taxiGoEnabled" = true;

-- 7. Migrate boarding addon RETURN (taxiReturnEnabled = true)
INSERT INTO "TaxiTrip" ("id", "bookingId", "tripType", "status", "date", "time", "address", "createdAt", "updatedAt")
SELECT
  'trip_ret_' || bd."bookingId",
  bd."bookingId",
  'RETURN',
  CASE WHEN bd."taxiReturnStatus" = 'COMPLETED' THEN 'ARRIVED_AT_CLIENT' ELSE 'PLANNED' END,
  bd."taxiReturnDate",
  bd."taxiReturnTime",
  bd."taxiReturnAddress",
  NOW(),
  NOW()
FROM "BoardingDetail" bd
WHERE bd."taxiReturnEnabled" = true;

-- 8. Bootstrap TaxiStatusHistory — one initial entry per migrated trip
INSERT INTO "TaxiStatusHistory" ("id", "taxiTripId", "status", "timestamp", "updatedBy", "createdAt")
SELECT
  'hist_' || "id",
  "id",
  "status",
  "createdAt",
  'MIGRATION',
  NOW()
FROM "TaxiTrip";

-- 9. Drop deprecated status columns
ALTER TABLE "BoardingDetail" DROP COLUMN IF EXISTS "taxiGoStatus";
ALTER TABLE "BoardingDetail" DROP COLUMN IF EXISTS "taxiReturnStatus";
