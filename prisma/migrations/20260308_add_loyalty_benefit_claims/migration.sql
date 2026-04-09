-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "LoyaltyBenefitClaim" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "benefitKey" TEXT NOT NULL,
    "benefitLabelFr" TEXT NOT NULL,
    "benefitLabelEn" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyBenefitClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "LoyaltyBenefitClaim_clientId_idx" ON "LoyaltyBenefitClaim"("clientId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "LoyaltyBenefitClaim_status_idx" ON "LoyaltyBenefitClaim"("status");

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'LoyaltyBenefitClaim_clientId_fkey'
  ) THEN
    ALTER TABLE "LoyaltyBenefitClaim"
      ADD CONSTRAINT "LoyaltyBenefitClaim_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'LoyaltyBenefitClaim_reviewedBy_fkey'
  ) THEN
    ALTER TABLE "LoyaltyBenefitClaim"
      ADD CONSTRAINT "LoyaltyBenefitClaim_reviewedBy_fkey"
      FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
