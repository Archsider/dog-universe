// POST /api/admin/migrations/[name]/mark-applied — SUPERADMIN only.
//
// "I ran the SQL on Supabase manually, mark it as applied" — inserts a row
// into `_app_migrations` so the /admin/health "Migrations DB" card stops
// flagging it as pending.  Idempotent : second call returns ok without
// touching the row.
//
// Source : user feedback 2026-05-19 — manuals SQL execution on Supabase
// SQL Editor never updates `_app_migrations`, so legitimate migrations
// stay marked "En attente" indefinitely.

import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';

export const dynamic = 'force-dynamic';

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations');

// Strict whitelist: migration folder names are date-prefixed snake_case.
// Anything else is a path-traversal attempt.
const NAME_RE = /^[a-z0-9_]+$/;

type Params = { params: Promise<{ name: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const { name } = await params;
  if (!NAME_RE.test(name)) {
    return NextResponse.json({ error: 'INVALID_NAME' }, { status: 400 });
  }

  const sqlPath = path.join(MIGRATIONS_DIR, name, 'migration.sql');
  if (!existsSync(sqlPath)) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const sql = await readFile(sqlPath, 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');

  // Idempotent insert : ON CONFLICT DO NOTHING.  If the table doesn't exist
  // yet (very young DB), surface a clear error so the operator knows to
  // run the bootstrap.
  try {
    await prisma.$executeRaw`
      INSERT INTO "_app_migrations" (name, checksum, applied_at)
      VALUES (${name}, ${checksum}, NOW())
      ON CONFLICT (name) DO NOTHING
    `;
  } catch (err) {
    return NextResponse.json({
      error: 'DB_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }

  await logAction({
    userId: session.user.id,
    action: 'MIGRATION_MARKED_APPLIED',
    entityType: 'AppMigration',
    entityId: name,
    details: { checksum },
  });

  return NextResponse.json({ ok: true, name, checksum });
}
