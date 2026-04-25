-- Add taxi status tracking fields to BoardingDetail
ALTER TABLE "BoardingDetail"
ADD COLUMN "taxiGoStatus" TEXT,
ADD COLUMN "taxiReturnStatus" TEXT;
