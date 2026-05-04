-- Migration: set ON DELETE RESTRICT on Booking, Invoice, LoyaltyGrade FK to User
-- Prevents silent orphan data when a User row is hard-deleted.
-- NOTE: Dog Universe uses soft-delete (deletedAt) — hard deletes are rare (admin only).
-- Run on Supabase: psql $DATABASE_URL -f migration.sql

-- Booking.clientId → User.id
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_clientId_fkey";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invoice.clientId → User.id
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_clientId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- LoyaltyGrade.clientId → User.id (was Cascade, now Restrict — grade stays attached)
ALTER TABLE "LoyaltyGrade" DROP CONSTRAINT IF EXISTS "LoyaltyGrade_clientId_fkey";
ALTER TABLE "LoyaltyGrade" ADD CONSTRAINT "LoyaltyGrade_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
