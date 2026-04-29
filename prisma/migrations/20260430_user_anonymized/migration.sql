-- RGPD anonymization marker. Set when a user (or SUPERADMIN on their behalf)
-- requests deletion of their account. Bookings/invoices stay intact for
-- accounting; this column only marks the User row as redacted.
ALTER TABLE "User" ADD COLUMN "anonymizedAt" TIMESTAMP(3);
CREATE INDEX "User_anonymizedAt_idx" ON "User"("anonymizedAt");
