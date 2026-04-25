-- Add boarding stay extension request fields to Booking
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "hasExtensionRequest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "extensionRequestedEndDate" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "extensionRequestNote" TEXT;
