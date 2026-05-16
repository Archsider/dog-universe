// Compare the list of migrations on disk (`prisma/migrations/*/migration.sql`)
// with what's recorded in the `_app_migrations` table. Used by
// `/api/admin/migrations/status` to surface pending/manual/drift to
// SUPERADMIN.
//
// Source : audit 2026-05-16 Hashimoto Q3 — "Migrations manuelles Supabase
// pending sans signal automatique". Sans cette diagnostic, une migration
// non-exécutée sur la prod Supabase reste invisible jusqu'à ce qu'une
// query plante.

import { createHash } from 'node:crypto';

export type MigrationStatus =
  /** Local file present + recorded in DB with matching checksum. */
  | 'ok'
  /** Local file present, NOT in DB → admin must run on Supabase. */
  | 'pending'
  /** Recorded in DB but no local file → manual / out-of-repo migration. */
  | 'manual'
  /** Local + DB present, but checksums diverge → SQL was modified after applying. */
  | 'drift';

export interface MigrationEntry {
  name: string;
  status: MigrationStatus;
  /** Present iff status === 'ok' || 'pending' || 'drift'. */
  localChecksum?: string;
  /** Present iff status === 'ok' || 'manual' || 'drift'. */
  dbChecksum?: string | null;
  /** Local SQL content — only populated for 'pending' (to copy into Supabase). */
  sql?: string;
}

export interface MigrationsDiff {
  entries: MigrationEntry[];
  counts: {
    ok: number;
    pending: number;
    manual: number;
    drift: number;
  };
  /** Pending count drives the SUPERADMIN sidebar badge. */
  pendingCount: number;
}

export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export interface LocalMigration {
  name: string;
  sql: string;
}

export interface DbMigration {
  name: string;
  checksum: string | null;
}

/**
 * Pure diff function — both inputs already gathered by the caller (fs +
 * Prisma query). Returns a sorted list of entries + counts.
 *
 * Sort order : pending first (loudest), then drift, then manual, then ok.
 * Within each bucket, alphabetical by name (date-prefixed = chronological).
 */
export function diffMigrations(local: LocalMigration[], db: DbMigration[]): MigrationsDiff {
  const dbByName = new Map(db.map((r) => [r.name, r.checksum]));
  const localByName = new Map(local.map((r) => [r.name, r.sql]));

  const entries: MigrationEntry[] = [];

  for (const m of local) {
    const localChecksum = sha256(m.sql);
    if (!dbByName.has(m.name)) {
      entries.push({
        name: m.name,
        status: 'pending',
        localChecksum,
        // Caller passes the SQL for the copy-paste button. Cap at 200kB
        // to avoid blowing the JSON response on a massive seed file.
        sql: m.sql.length > 200_000 ? m.sql.slice(0, 200_000) + '\n-- … (truncated)' : m.sql,
      });
    } else {
      const dbChecksum = dbByName.get(m.name) ?? null;
      if (dbChecksum && dbChecksum !== localChecksum) {
        entries.push({ name: m.name, status: 'drift', localChecksum, dbChecksum });
      } else {
        entries.push({ name: m.name, status: 'ok', localChecksum, dbChecksum });
      }
    }
  }

  for (const r of db) {
    if (!localByName.has(r.name)) {
      entries.push({ name: r.name, status: 'manual', dbChecksum: r.checksum });
    }
  }

  const priority: Record<MigrationStatus, number> = {
    pending: 0,
    drift: 1,
    manual: 2,
    ok: 3,
  };
  entries.sort((a, b) => {
    const p = priority[a.status] - priority[b.status];
    if (p !== 0) return p;
    return a.name.localeCompare(b.name);
  });

  const counts = { ok: 0, pending: 0, manual: 0, drift: 0 };
  for (const e of entries) counts[e.status]++;

  return { entries, counts, pendingCount: counts.pending };
}
