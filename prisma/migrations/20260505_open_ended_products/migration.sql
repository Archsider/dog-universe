-- Open-ended bookings: walk-in stays where exit date is set later via "Clôturer le séjour"
ALTER TABLE "Booking" ADD COLUMN "isOpenEnded" BOOLEAN DEFAULT false;
ALTER TABLE "Booking" ALTER COLUMN "endDate" DROP NOT NULL;

-- Product catalogue: items sold à la carte during a stay
CREATE TABLE IF NOT EXISTS "Product" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "brand"     TEXT,
  "reference" TEXT,
  "price"     DECIMAL(10,2) NOT NULL,
  "stock"     INTEGER NOT NULL DEFAULT 0,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "Product_active_idx" ON "Product"("active");

-- If Product already exists from a previous environment, just add the new columns idempotently:
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "reference" TEXT;
