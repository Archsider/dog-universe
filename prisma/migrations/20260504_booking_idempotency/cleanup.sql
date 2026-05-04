-- Cleanup script: soft-delete duplicate bookings (same clientId + startDate + endDate)
-- Keep the oldest booking per group (lowest createdAt).
-- Run on production Supabase ONLY after the migration.sql has been applied.
-- NOTE: Invoice does not have deletedAt — orphaned invoices on deleted bookings
-- are left as-is (accounting integrity). Admin can cancel them manually if needed.

-- 1. Identify and soft-delete duplicate bookings
-- (same clientId + startDate + endDate — keep the most ancient)
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "clientId", "startDate", "endDate"
           ORDER BY "createdAt" ASC
         ) AS rn
  FROM "Booking"
  WHERE "deletedAt" IS NULL
)
UPDATE "Booking" SET "deletedAt" = NOW()
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- 2. Cancel invoices linked to the soft-deleted bookings (status → CANCELLED)
-- Invoice has no deletedAt — set status to CANCELLED for consistency.
UPDATE "Invoice" SET "status" = 'CANCELLED'
WHERE "bookingId" IN (
  SELECT id FROM "Booking" WHERE "deletedAt" IS NOT NULL
)
AND "status" != 'CANCELLED';

-- 3. Count cleaned up rows (diagnostic)
SELECT
  (SELECT COUNT(*) FROM "Booking" WHERE "deletedAt" IS NOT NULL) AS bookings_soft_deleted,
  (SELECT COUNT(*) FROM "Invoice" WHERE "status" = 'CANCELLED') AS invoices_cancelled;
