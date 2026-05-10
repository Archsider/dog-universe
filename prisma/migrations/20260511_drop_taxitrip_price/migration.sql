-- Drop TaxiTrip.price — duplicates TaxiDetail.price / BoardingDetail.taxiAddonPrice
-- and was prone to drift. Consumers should source price from the parent detail row.
ALTER TABLE "TaxiTrip" DROP COLUMN IF EXISTS "price";
