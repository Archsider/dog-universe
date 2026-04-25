-- Add serviceType to Invoice
-- Values: "BOARDING" | "PET_TAXI" | "GROOMING" | "PRODUCT_SALE" | NULL (legacy invoices)
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "serviceType" TEXT;
