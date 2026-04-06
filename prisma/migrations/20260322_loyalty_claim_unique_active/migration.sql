-- Prevent concurrent duplicate PENDING or APPROVED loyalty benefit claims
-- for the same (clientId, benefitKey) pair.
-- REJECTED claims are excluded so clients can re-submit after a refusal.
CREATE UNIQUE INDEX "loyalty_claim_active_unique"
  ON "LoyaltyBenefitClaim" ("clientId", "benefitKey")
  WHERE status IN ('PENDING', 'APPROVED');
