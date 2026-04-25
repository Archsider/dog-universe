-- CreateTable: PetWeightEntry
-- Stores the historical weight measurements for each pet.
-- Pet.weight (existing column) remains as the "current weight" cache
-- and is updated automatically whenever a new entry is added.

CREATE TABLE "PetWeightEntry" (
    "id"         TEXT NOT NULL,
    "petId"      TEXT NOT NULL,
    "weightKg"   DOUBLE PRECISION NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note"       TEXT,

    CONSTRAINT "PetWeightEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PetWeightEntry_petId_idx" ON "PetWeightEntry"("petId");
CREATE INDEX "PetWeightEntry_measuredAt_idx" ON "PetWeightEntry"("measuredAt");

ALTER TABLE "PetWeightEntry" ADD CONSTRAINT "PetWeightEntry_petId_fkey"
    FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
