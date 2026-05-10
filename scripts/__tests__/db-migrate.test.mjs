import { describe, it, expect } from 'vitest';
import { validateMigrationSql } from '../db-migrate.mjs';

describe('validateMigrationSql', () => {
  it('accepts a simple CREATE TABLE', () => {
    const sql = `CREATE TABLE "Foo" (id TEXT PRIMARY KEY);`;
    expect(validateMigrationSql('x', sql).ok).toBe(true);
  });

  it('rejects DROP TABLE without IF EXISTS', () => {
    const sql = `DROP TABLE "Foo";`;
    const r = validateMigrationSql('x', sql);
    expect(r.ok).toBe(false);
    expect(r.violations.join('\n')).toMatch(/DROP TABLE without IF EXISTS/);
  });

  it('accepts DROP TABLE IF EXISTS', () => {
    const sql = `DROP TABLE IF EXISTS "Foo";`;
    expect(validateMigrationSql('x', sql).ok).toBe(true);
  });

  it('rejects DELETE FROM without WHERE', () => {
    const sql = `DELETE FROM "Foo";`;
    const r = validateMigrationSql('x', sql);
    expect(r.ok).toBe(false);
    expect(r.violations.join('\n')).toMatch(/DELETE FROM without WHERE/);
  });

  it('accepts DELETE FROM with WHERE', () => {
    const sql = `DELETE FROM "Foo" WHERE id = '1';`;
    expect(validateMigrationSql('x', sql).ok).toBe(true);
  });

  it('rejects UPDATE without WHERE', () => {
    const sql = `UPDATE "Foo" SET name = 'x';`;
    const r = validateMigrationSql('x', sql);
    expect(r.ok).toBe(false);
    expect(r.violations.join('\n')).toMatch(/UPDATE without WHERE/);
  });

  it('accepts UPDATE with WHERE', () => {
    const sql = `UPDATE "Foo" SET name = 'x' WHERE id = '1';`;
    expect(validateMigrationSql('x', sql).ok).toBe(true);
  });

  it('ignores ON CONFLICT DO UPDATE (not a top-level UPDATE)', () => {
    const sql = `INSERT INTO "Foo"(id, name) VALUES ('1', 'a') ON CONFLICT (id) DO UPDATE SET name = 'a';`;
    expect(validateMigrationSql('x', sql).ok).toBe(true);
  });

  it('ignores ON UPDATE CASCADE inside FK', () => {
    const sql = `ALTER TABLE "Foo" ADD CONSTRAINT fk FOREIGN KEY (bar_id) REFERENCES "Bar"(id) ON DELETE CASCADE ON UPDATE CASCADE;`;
    expect(validateMigrationSql('x', sql).ok).toBe(true);
  });

  it('ignores UPDATE inside dollar-quoted function body', () => {
    const sql = `
      DO $$
      BEGIN
        UPDATE "Foo" SET x = 1;
      END
      $$;
    `;
    expect(validateMigrationSql('x', sql).ok).toBe(true);
  });

  it('flags >100-line migrations without @safety: reviewed', () => {
    const sql = Array.from({ length: 120 }, () => '-- noise').join('\n') + '\nCREATE TABLE "Foo" (id TEXT);';
    const r = validateMigrationSql('x', sql);
    expect(r.ok).toBe(false);
    expect(r.violations.join('\n')).toMatch(/> 100 lines/);
  });

  it('accepts >100-line migrations with @safety: reviewed header', () => {
    const header = '-- @safety: reviewed\n';
    const body = Array.from({ length: 120 }, () => '-- noise').join('\n') + '\nCREATE TABLE "Foo" (id TEXT);';
    expect(validateMigrationSql('x', header + body).ok).toBe(true);
  });

  it('@safety: reviewed bypasses WHERE-less UPDATE rule (intentional backfill)', () => {
    const sql = `-- @safety: reviewed\nUPDATE "Foo" SET migrated = true;`;
    expect(validateMigrationSql('x', sql).ok).toBe(true);
  });

  it('skips comment-only UPDATE references', () => {
    const sql = `-- We previously did UPDATE Foo SET x=1\nCREATE TABLE "Foo" (id TEXT);`;
    expect(validateMigrationSql('x', sql).ok).toBe(true);
  });

  it('ignores UPDATE inside string literal', () => {
    const sql = `INSERT INTO "Log"(message) VALUES ('UPDATE Foo SET x = 1') ON CONFLICT DO NOTHING;`;
    expect(validateMigrationSql('x', sql).ok).toBe(true);
  });
});
