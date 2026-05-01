-- Kilométrage cumulatif par trajet taxi
-- Incrémenté à chaque push GPS (haversine, filtre < 10 m)
ALTER TABLE "TaxiTrip" ADD COLUMN IF NOT EXISTS "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0;
