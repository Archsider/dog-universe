-- H8 — Optimistic lock on LoyaltyGrade.
-- Prevents auto-recompute (e.g. payment finalisation) from overwriting an
-- admin override that landed milliseconds earlier. Conditional UPDATE in
-- src/lib/payments.ts skips silently if version no longer matches.
ALTER TABLE "LoyaltyGrade" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "_app_migrations"(name) VALUES ('20260512_loyalty_grade_version') ON CONFLICT DO NOTHING;
