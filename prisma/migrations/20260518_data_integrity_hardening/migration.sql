-- Data integrity hardening — 4 CHECK constraints sur Review/Payment/TimeProposal.
-- @rollback: see down.sql
-- @safety: reviewed — CHECK constraints only, idempotent via DO blocks.
-- Aucun ALTER TABLE destructif, aucun DELETE. Refuse les rows
-- futurs hors-range; n'altère pas les rows existants.

BEGIN;

-- Review.rating ∈ [1, 5]
DO $$ BEGIN
  ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Payment.amount ≠ 0 (positive = encaissement, negative = refund)
DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_nonzero" CHECK ("amount" <> 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TimeProposal.proposedByRole ∈ enum {CLIENT, ADMIN, SUPERADMIN}
DO $$ BEGIN
  ALTER TABLE "TimeProposal" ADD CONSTRAINT "TimeProposal_proposedByRole_enum"
    CHECK ("proposedByRole" IN ('CLIENT','ADMIN','SUPERADMIN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- TimeProposal.respondedByRole nullable mais doit respecter l'enum si renseigné
DO $$ BEGIN
  ALTER TABLE "TimeProposal" ADD CONSTRAINT "TimeProposal_respondedByRole_enum"
    CHECK ("respondedByRole" IS NULL OR "respondedByRole" IN ('CLIENT','ADMIN','SUPERADMIN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "_app_migrations" (name) VALUES ('20260518_data_integrity_hardening')
  ON CONFLICT (name) DO NOTHING;

COMMIT;
