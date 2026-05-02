CREATE INDEX IF NOT EXISTS "LoyaltyBenefitClaim_clientId_status_idx" ON "LoyaltyBenefitClaim"("clientId", "status");
CREATE INDEX IF NOT EXISTS "LoyaltyBenefitClaim_status_claimedAt_idx" ON "LoyaltyBenefitClaim"("status", "claimedAt");
