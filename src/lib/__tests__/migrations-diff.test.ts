import { describe, it, expect } from 'vitest';
import { diffMigrations, sha256, type LocalMigration, type DbMigration } from '../migrations-diff';

const SQL_A = 'CREATE TABLE foo (id text);';
const SQL_B = 'CREATE TABLE bar (id text);';
const SQL_A_MODIFIED = 'CREATE TABLE foo (id text, name text);';

function local(name: string, sql: string): LocalMigration {
  return { name, sql };
}
function db(name: string, sql: string): DbMigration {
  return { name, checksum: sha256(sql) };
}

describe('diffMigrations', () => {
  it('categorises a clean state as all OK', () => {
    const r = diffMigrations(
      [local('20260101_a', SQL_A), local('20260102_b', SQL_B)],
      [db('20260101_a', SQL_A), db('20260102_b', SQL_B)],
    );
    expect(r.counts).toEqual({ ok: 2, pending: 0, manual: 0, drift: 0 });
    expect(r.pendingCount).toBe(0);
    expect(r.entries.every((e) => e.status === 'ok')).toBe(true);
  });

  it('flags a local migration absent from DB as pending', () => {
    const r = diffMigrations(
      [local('20260101_a', SQL_A), local('20260103_new', SQL_B)],
      [db('20260101_a', SQL_A)],
    );
    expect(r.counts.pending).toBe(1);
    expect(r.entries[0].status).toBe('pending'); // sorts first
    expect(r.entries[0].name).toBe('20260103_new');
    // Pending entry carries the SQL for the "copy" button.
    expect(r.entries[0].sql).toBe(SQL_B);
  });

  it('flags a DB migration absent from local fs as manual', () => {
    const r = diffMigrations(
      [local('20260101_a', SQL_A)],
      [db('20260101_a', SQL_A), db('20259999_legacy_manual', SQL_B)],
    );
    expect(r.counts.manual).toBe(1);
    const manual = r.entries.find((e) => e.status === 'manual');
    expect(manual?.name).toBe('20259999_legacy_manual');
    expect(manual?.sql).toBeUndefined();
  });

  it('flags checksum mismatch as drift', () => {
    const r = diffMigrations(
      [local('20260101_a', SQL_A_MODIFIED)],
      [db('20260101_a', SQL_A)], // stored checksum is for original SQL_A
    );
    expect(r.counts.drift).toBe(1);
    const drift = r.entries.find((e) => e.status === 'drift');
    expect(drift?.localChecksum).toBe(sha256(SQL_A_MODIFIED));
    expect(drift?.dbChecksum).toBe(sha256(SQL_A));
  });

  it('treats null DB checksum as OK (legacy applied migration with no recorded hash)', () => {
    const r = diffMigrations(
      [local('20260101_a', SQL_A)],
      [{ name: '20260101_a', checksum: null }],
    );
    // No drift since dbChecksum is null — we can't compare.
    expect(r.counts).toEqual({ ok: 1, pending: 0, manual: 0, drift: 0 });
  });

  it('sorts pending before drift before manual before ok', () => {
    const r = diffMigrations(
      [
        local('20260101_a', SQL_A),
        local('20260102_pending', SQL_B),
        local('20260103_drift', SQL_A_MODIFIED),
      ],
      [
        db('20260101_a', SQL_A),
        db('20260103_drift', SQL_A), // stored before file edit
        db('20259999_manual_old', SQL_B),
      ],
    );
    expect(r.entries.map((e) => e.status)).toEqual(['pending', 'drift', 'manual', 'ok']);
  });

  it('truncates the inline SQL payload at 200 kB for the copy button', () => {
    const huge = 'SELECT 1;\n'.repeat(30_000); // ~300 kB
    const r = diffMigrations(
      [local('20260101_huge', huge)],
      [],
    );
    expect(r.entries[0].status).toBe('pending');
    expect(r.entries[0].sql!.length).toBeLessThanOrEqual(200_100);
    expect(r.entries[0].sql).toContain('-- … (truncated)');
  });
});
