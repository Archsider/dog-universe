// Feature flag detail API — SUPERADMIN only.
// PATCH  — update partiel.
// DELETE — purge.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { invalidateFlagCache } from '@/lib/feature-flags';
import { requireRole } from '@/lib/auth-guards';

const ROLES = ['CLIENT', 'ADMIN', 'SUPERADMIN'] as const;

const patchSchema = z.object({
  description:    z.string().max(500).optional(),
  enabled:        z.boolean().optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
  targetRoles:    z.array(z.enum(ROLES)).max(3).optional(),
  userWhitelist:  z.array(z.string().min(1).max(64)).max(500).optional(),
}).strict();

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;

  const { key } = await params;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const flag = await prisma.featureFlag.update({
      where: { key },
      data: parsed.data,
    });
    await invalidateFlagCache(key);
    return NextResponse.json(flag);
  } catch {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;

  const { key } = await params;

  try {
    await prisma.featureFlag.delete({ where: { key } });
    await invalidateFlagCache(key);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
}
