# Audit Log — Immutability & Bypass Procedure

Tier 2 hardening (2026-05-09).

## Model

`ActionLog` (Prisma model, table `"ActionLog"`) is the canonical audit trail. Rows are written via `logAction(...)` from `src/lib/audit.ts` for every privileged event (login, password change, booking mutation, contract signing, danger ops, photo deletion, etc.).

## Immutability guarantee (DB-level)

Migration `20260509_audit_log_immutable` installs a Postgres trigger that raises on any `UPDATE` or `DELETE` against `"ActionLog"`:

```sql
CREATE OR REPLACE FUNCTION prevent_actionlog_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ActionLog rows are immutable (audit trail)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER actionlog_no_update
  BEFORE UPDATE OR DELETE ON "ActionLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_actionlog_mutation();
```

Why: the application code only INSERTs, but a compromised DB connection (leaked `DATABASE_URL`, SQL injection on a third-party route, malicious migration) could otherwise rewrite history. The trigger turns the audit table into an append-only log at the lowest level we control.

## Application policy

- **Never** call `prisma.actionLog.update`, `prisma.actionLog.delete`, or `deleteMany` on this model.
- **Never** TRUNCATE the table.
- Retention: indefinite. We accept the storage cost.

## Bypass procedure (SUPERADMIN only)

There is no automated bypass. If the trigger must be lifted (e.g. legal request to redact a specific PII row, or correcting a corrupted insert from a deploy bug):

1. The SUPERADMIN opens a support ticket describing the rationale.
2. Connect to Supabase Postgres directly with the service-role connection (NOT via the app):
   ```sql
   ALTER TABLE "ActionLog" DISABLE TRIGGER actionlog_no_update;
   -- perform the surgical fix, ideally inside BEGIN/COMMIT
   ALTER TABLE "ActionLog" ENABLE TRIGGER actionlog_no_update;
   ```
3. Insert a synthetic `ActionLog` entry of action `AUDIT_OVERRIDE` with the JSON payload describing what was changed, by whom, and the ticket reference.
4. Update this file with the date and ticket ID.

Do not script the bypass and do not put the disable in any migration that runs automatically. Manual ops only.

## Bypass log

| Date | Ticket | Operator | Reason |
|------|--------|----------|--------|
| —    | —      | —        | None to date. |
