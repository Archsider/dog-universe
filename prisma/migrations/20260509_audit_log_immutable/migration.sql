-- Tier 2 hardening (2026-05-09) — make ActionLog immutable at the DB level.
--
-- The application already only INSERTs ActionLog rows (via logAction). This
-- trigger guarantees that even a compromised DB connection (or a bug) cannot
-- silently rewrite or erase audit history. UPDATE and DELETE both raise.
--
-- Bypass procedure (DO NOT script — manual SUPERADMIN op):
--   1. ALTER TABLE "ActionLog" DISABLE TRIGGER actionlog_no_update;
--   2. perform the surgical fix
--   3. ALTER TABLE "ActionLog" ENABLE TRIGGER actionlog_no_update;
--   4. log the rotation in docs/AUDIT_LOG.md.
-- Idempotent: function is OR REPLACE, trigger is dropped first.

CREATE OR REPLACE FUNCTION prevent_actionlog_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ActionLog rows are immutable (audit trail)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS actionlog_no_update ON "ActionLog";
CREATE TRIGGER actionlog_no_update
  BEFORE UPDATE OR DELETE ON "ActionLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_actionlog_mutation();
