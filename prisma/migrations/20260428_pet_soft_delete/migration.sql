-- Add soft-delete to Pet model
ALTER TABLE "Pet" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Pet_deletedAt_idx" ON "Pet"("deletedAt");
