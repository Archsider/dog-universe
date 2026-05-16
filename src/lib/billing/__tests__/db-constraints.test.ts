import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * String-match guard for `20260518_data_integrity_hardening`.
 *
 * We do not spin up a real Postgres in this suite (covered by the
 * `migration-rollback-check` CI workflow which actually runs the SQL).
 * What we DO guard here is that the migration cannot be silently
 * rewritten to drop a constraint without the test going red — every
 * constraint listed below is load-bearing for production data integrity.
 */

const MIG_DIR = resolve(__dirname, '../../../../prisma/migrations/20260518_data_integrity_hardening');
const upSql = readFileSync(resolve(MIG_DIR, 'migration.sql'), 'utf8');
const downSql = readFileSync(resolve(MIG_DIR, 'down.sql'), 'utf8');

describe('migration 20260518_data_integrity_hardening', () => {
  it('declares Review.rating CHECK in [1,5]', () => {
    expect(upSql).toMatch(/CONSTRAINT\s+"Review_rating_range"/);
    expect(upSql).toMatch(/CHECK\s*\(\s*"rating"\s+BETWEEN\s+1\s+AND\s+5\s*\)/);
  });

  it('declares Payment.amount CHECK <> 0 (refunds = negative, encaissements = positive)', () => {
    expect(upSql).toMatch(/CONSTRAINT\s+"Payment_amount_nonzero"/);
    expect(upSql).toMatch(/CHECK\s*\(\s*"amount"\s*<>\s*0\s*\)/);
  });

  it('declares TimeProposal.proposedByRole enum CHECK', () => {
    expect(upSql).toMatch(/CONSTRAINT\s+"TimeProposal_proposedByRole_enum"/);
    expect(upSql).toMatch(/'CLIENT'\s*,\s*'ADMIN'\s*,\s*'SUPERADMIN'/);
  });

  it('declares TimeProposal.respondedByRole nullable enum CHECK', () => {
    expect(upSql).toMatch(/CONSTRAINT\s+"TimeProposal_respondedByRole_enum"/);
    // respondedByRole accepts NULL (not yet responded) or one of the 3 roles.
    expect(upSql).toMatch(/"respondedByRole"\s+IS\s+NULL/);
  });

  it('is idempotent (DO blocks swallow duplicate_object)', () => {
    // Each ALTER must be wrapped so a re-run of the migration does not
    // throw "constraint already exists" — critical for Supabase manual
    // executions where Mehdi may apply migrations twice by accident.
    const blockCount = (upSql.match(/EXCEPTION\s+WHEN\s+duplicate_object/gi) ?? []).length;
    expect(blockCount).toBe(4);
  });

  it('records itself in _app_migrations on apply', () => {
    expect(upSql).toMatch(/INSERT\s+INTO\s+"_app_migrations"/);
    expect(upSql).toMatch(/'20260518_data_integrity_hardening'/);
  });

  it('down.sql drops every constraint introduced by migration.sql', () => {
    expect(downSql).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+"Review_rating_range"/);
    expect(downSql).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+"Payment_amount_nonzero"/);
    expect(downSql).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+"TimeProposal_proposedByRole_enum"/);
    expect(downSql).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+"TimeProposal_respondedByRole_enum"/);
    expect(downSql).toMatch(/DELETE\s+FROM\s+"_app_migrations"/);
  });
});
