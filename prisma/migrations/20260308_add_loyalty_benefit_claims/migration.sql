-- CreateTable
CREATE TABLE "LoyaltyBenefitClaim" (
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

-- CreateIndex
CREATE INDEX "LoyaltyBenefitClaim_clientId_idx" ON "LoyaltyBenefitClaim"("clientId");

-- CreateIndex
CREATE INDEX "LoyaltyBenefitClaim_status_idx" ON "LoyaltyBenefitClaim"("status");

-- AddForeignKey
ALTER TABLE "LoyaltyBenefitClaim" ADD CONSTRAINT "LoyaltyBenefitClaim_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyBenefitClaim" ADD CONSTRAINT "LoyaltyBenefitClaim_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
