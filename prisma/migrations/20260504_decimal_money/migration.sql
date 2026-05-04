-- Migrate all monetary columns from Float (DOUBLE PRECISION) to DECIMAL(10,2).
-- Avoids floating-point rounding drift on MAD amounts (centimes precision).
-- Non-monetary Float columns (Pet.weight, PetWeightEntry.weightKg, TaxiTrip.distanceKm,
-- TaxiLocation.lat/lng/heading/speed/accuracy) intentionally stay as Float.

ALTER TABLE "User"           ALTER COLUMN "historicalSpendMAD" TYPE DECIMAL(10,2) USING "historicalSpendMAD"::DECIMAL(10,2);

ALTER TABLE "Booking"        ALTER COLUMN "totalPrice"         TYPE DECIMAL(10,2) USING "totalPrice"::DECIMAL(10,2);

ALTER TABLE "BookingItem"    ALTER COLUMN "unitPrice"          TYPE DECIMAL(10,2) USING "unitPrice"::DECIMAL(10,2);
ALTER TABLE "BookingItem"    ALTER COLUMN "total"              TYPE DECIMAL(10,2) USING "total"::DECIMAL(10,2);

ALTER TABLE "BoardingDetail" ALTER COLUMN "groomingPrice"      TYPE DECIMAL(10,2) USING "groomingPrice"::DECIMAL(10,2);
ALTER TABLE "BoardingDetail" ALTER COLUMN "pricePerNight"      TYPE DECIMAL(10,2) USING "pricePerNight"::DECIMAL(10,2);
ALTER TABLE "BoardingDetail" ALTER COLUMN "taxiAddonPrice"     TYPE DECIMAL(10,2) USING "taxiAddonPrice"::DECIMAL(10,2);

ALTER TABLE "TaxiDetail"     ALTER COLUMN "price"              TYPE DECIMAL(10,2) USING "price"::DECIMAL(10,2);

ALTER TABLE "TaxiTrip"       ALTER COLUMN "price"              TYPE DECIMAL(10,2) USING "price"::DECIMAL(10,2);

ALTER TABLE "Invoice"        ALTER COLUMN "amount"             TYPE DECIMAL(10,2) USING "amount"::DECIMAL(10,2);
ALTER TABLE "Invoice"        ALTER COLUMN "paidAmount"         TYPE DECIMAL(10,2) USING "paidAmount"::DECIMAL(10,2);

ALTER TABLE "InvoiceItem"    ALTER COLUMN "unitPrice"          TYPE DECIMAL(10,2) USING "unitPrice"::DECIMAL(10,2);
ALTER TABLE "InvoiceItem"    ALTER COLUMN "total"              TYPE DECIMAL(10,2) USING "total"::DECIMAL(10,2);
ALTER TABLE "InvoiceItem"    ALTER COLUMN "allocatedAmount"    TYPE DECIMAL(10,2) USING "allocatedAmount"::DECIMAL(10,2);

ALTER TABLE "Payment"        ALTER COLUMN "amount"             TYPE DECIMAL(10,2) USING "amount"::DECIMAL(10,2);

ALTER TABLE "MonthlyRevenueSummary" ALTER COLUMN "boardingRevenue" TYPE DECIMAL(10,2) USING "boardingRevenue"::DECIMAL(10,2);
ALTER TABLE "MonthlyRevenueSummary" ALTER COLUMN "groomingRevenue" TYPE DECIMAL(10,2) USING "groomingRevenue"::DECIMAL(10,2);
ALTER TABLE "MonthlyRevenueSummary" ALTER COLUMN "taxiRevenue"     TYPE DECIMAL(10,2) USING "taxiRevenue"::DECIMAL(10,2);
ALTER TABLE "MonthlyRevenueSummary" ALTER COLUMN "otherRevenue"    TYPE DECIMAL(10,2) USING "otherRevenue"::DECIMAL(10,2);
