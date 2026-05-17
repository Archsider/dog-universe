-- Phase 3 perf indexes — audit result (2026-05-19).
-- @safety: reviewed — all proposed indexes were found to already exist.
-- @rollback: see down.sql
--
-- Audit result — all 7 proposed indexes were already present in the schema:
--
--   BookingPet(petId)         → @@index([petId])           schema.prisma line 293
--   BookingPet(bookingId)     → @@index([bookingId])        schema.prisma line 294
--   Payment(invoiceId)        → @@index([invoiceId])        schema.prisma line 535
--   InvoiceItem(invoiceId)    → @@index([invoiceId])        schema.prisma line 519
--   TaxiTrip(bookingId)       → @@index([bookingId])        schema.prisma line 391
--   BookingItem(bookingId)    → @@index([bookingId])        schema.prisma line 314
--   Review(bookingId)         → @unique (auto-index)        schema.prisma (bookingId @unique)
--
-- LoyaltyBenefitClaim: the proposed (status, createdAt DESC) was not added
-- because:
--   (a) the model has no createdAt column — it uses claimedAt instead;
--   (b) the existing @@index([status, claimedAt]) already covers the hot
--       path (admin loyalty claims API orders by claimedAt DESC);
--   (c) the sidebar count query uses WHERE status='PENDING' which is covered
--       by the existing @@index([status]).
--
-- Migration is a no-op except for the _app_migrations record.

BEGIN;

INSERT INTO "_app_migrations" (name) VALUES ('20260519_phase3_perf_indexes')
  ON CONFLICT (name) DO NOTHING;

COMMIT;
