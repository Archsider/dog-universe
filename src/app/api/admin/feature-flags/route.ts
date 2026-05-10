// Feature flags admin API — SUPERADMIN only.
// GET   — liste tous les flags.
// POST  — crée ou upsert un flag.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { invalidateFlagCache } from '@/lib/feature-flags';

const FLAG_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ROLES = ['CLIENT', 'ADMIN', 'SUPERADMIN'] as const;

const upsertSchema = z.object({
  key:            z.string().regex(FLAG_KEY, 'INVALID_KEY'),
  description:    z.string().max(500).optional(),
  enabled:        z.boolean().optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
  targetRoles:    z.array(z.enum(ROLES)).max(3).optional(),
  userWhitelist:  z.array(z.string().min(1).max(64)).max(500).optional(),
});

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') return forbidden();

  const flags = await prisma.featureFlag.findMany({
    orderBy: { key: 'asc' },
    take: 500,
  });
  return NextResponse.json(flags);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') return forbidden();

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 }); }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() }, { status: 400 });
  }

  const { key, description, enabled, rolloutPercent, targetRoles, userWhitelist } = parsed.data;

  const flag = await prisma.featureFlag.upsert({
    where: { key },
    create: {
      key,
      description:    description ?? '',
      enabled:        enabled ?? false,
      rolloutPercent: rolloutPercent ?? 0,
      targetRoles:    targetRoles ?? [],
      userWhitelist:  userWhitelist ?? [],
    },
    update: {
      ...(description    !== undefined && { description }),
      ...(enabled        !== undefined && { enabled }),
      ...(rolloutPercent !== undefined && { rolloutPercent }),
      ...(targetRoles    !== undefined && { targetRoles }),
      ...(userWhitelist  !== undefined && { userWhitelist }),
    },
  });

  await invalidateFlagCache(key);
  return NextResponse.json(flag, { status: 201 });
}
