// GET  /api/admin/maintenance/storage-orphans — SUPERADMIN scan (dry-run)
// POST /api/admin/maintenance/storage-orphans — SUPERADMIN bulk delete
//
// Scans all buckets vs DB references and returns the diff.  Deletion is a
// separate explicit POST with the keys to remove + a `confirm: true` token.
//
// Source : Wave 7.1 follow-up to /admin/maintenance.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import { findStorageOrphans, deleteStorageOrphans } from '@/lib/storage-orphans';
import { logAction } from '@/lib/log';

export const dynamic = 'force-dynamic';
// Storage scan can list ~10k files → 30 s budget.
export const maxDuration = 60;

export async function GET() {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;

  try {
    const result = await findStorageOrphans();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

const deleteSchema = z.object({
  confirm: z.literal(true),
  items: z.array(z.object({
    bucket: z.string().min(1).max(50),
    key:    z.string().min(1).max(500),
  })).min(1).max(500),
}).strict();

export async function POST(req: NextRequest) {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  let body;
  try {
    body = deleteSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  }

  try {
    const result = await deleteStorageOrphans(body.items);
    await logAction({
      userId: session.user.id,
      action: 'STORAGE_ORPHANS_DELETED',
      entityType: 'System',
      entityId: 'storage-orphans',
      details: { ...result, requested: body.items.length },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
