import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRollbackHeader, loadDownSql } from '../db-rollback.mjs';

describe('parseRollbackHeader', () => {
  it('returns undefined when no @rollback directive is present', () => {
    expect(parseRollbackHeader('-- normal down\nDROP TABLE IF EXISTS "X";')).toBeUndefined();
  });

  it('returns "not-applicable" on the canonical marker', () => {
    expect(parseRollbackHeader('-- @rollback: not-applicable\n')).toBe('not-applicable');
  });

  it('is case-insensitive on the directive name', () => {
    expect(parseRollbackHeader('-- @ROLLBACK: NOT-APPLICABLE')).toBe('not-applicable');
  });

  it('tolerates extra whitespace around the marker', () => {
    expect(parseRollbackHeader('--   @rollback:   not-applicable  ')).toBe('not-applicable');
  });

  it('ignores @rollback markers past the first 5 lines', () => {
    const sql = '\n\n\n\n\n-- @rollback: not-applicable\n';
    expect(parseRollbackHeader(sql)).toBeUndefined();
  });

  it('parses arbitrary directive values', () => {
    expect(parseRollbackHeader('-- @rollback: manual')).toBe('manual');
  });

  it('returns undefined on empty input', () => {
    expect(parseRollbackHeader('')).toBeUndefined();
  });
});

describe('loadDownSql', () => {
  let tmp;
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'rollback-tests-'));
    // Migration with executable down.sql
    mkdirSync(join(tmp, '20260101_with_down'), { recursive: true });
    writeFileSync(join(tmp, '20260101_with_down', 'down.sql'), 'DROP TABLE IF EXISTS "Foo";\n');
    // Migration with not-applicable down.sql
    mkdirSync(join(tmp, '20260102_no_rollback'), { recursive: true });
    writeFileSync(
      join(tmp, '20260102_no_rollback', 'down.sql'),
      '-- @rollback: not-applicable\n-- destructive seed\n',
    );
    // Migration with NO down.sql
    mkdirSync(join(tmp, '20260103_missing'), { recursive: true });
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reports found:false when down.sql is missing', () => {
    expect(loadDownSql('20260103_missing', tmp)).toEqual({ found: false });
  });

  it('returns sql + no directive on a normal down.sql', () => {
    const r = loadDownSql('20260101_with_down', tmp);
    expect(r.found).toBe(true);
    expect(r.directive).toBeUndefined();
    expect(r.sql).toMatch(/DROP TABLE/);
  });

  it('flags directive on a not-applicable down.sql', () => {
    const r = loadDownSql('20260102_no_rollback', tmp);
    expect(r.found).toBe(true);
    expect(r.directive).toBe('not-applicable');
  });
});
