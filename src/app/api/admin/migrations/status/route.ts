// GET /api/admin/migrations/status — SUPERADMIN only.
//
// Returns the diff between prisma/migrations/*/migration.sql (fs) and
// `_app_migrations` (DB). Used by /admin/health "Migrations DB" card to
// surface pending migrations the operator must execute on Supabase.
//
// Source : audit 2026-05-16 Hashimoto Q3.

import { NextResponse } from 'next/server';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { diffMigrations, type LocalMigration, type DbMigration } from '@/lib/migrations-diff';

export const dynamic = 'force-dynamic';

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations');

async function loadLocalMigrations(): Promise<LocalMigration[]> {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  const entries = await readdir(MIGRATIONS_DIR);
  const out: LocalMigration[] = [];
  for (const name of entries) {
    const dir = path.join(MIGRATIONS_DIR, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch { continue; }
    const sqlPath = path.join(dir, 'migration.sql');
    if (!existsSync(sqlPath)) continue;
    const sql = await readFile(sqlPath, 'utf8');
    out.push({ name, sql });
  }
  return out;
}

async function loadDbMigrations(): Promise<DbMigration[]> {
  try {
    const rows = await prisma.$queryRaw<{ name: string; checksum: string | null }[]>`
      SELECT name, checksum FROM "_app_migrations" ORDER BY name ASC
    `;
    return rows.map((r) => ({ name: r.name, checksum: r.checksum }));
  } catch {
    // Table absente sur DB neuve / dev — pas une erreur, juste 0 row.
    return [];
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  const [local, db] = await Promise.all([loadLocalMigrations(), loadDbMigrations()]);
  const diff = diffMigrations(local, db);
  return NextResponse.json(diff);
}
