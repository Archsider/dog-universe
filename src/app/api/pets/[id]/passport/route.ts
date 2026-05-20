// POST /api/pets/[id]/passport
//
// Generate a shareable Health Passport link for a pet.
// Auth: pet owner (CLIENT) OR ADMIN / SUPERADMIN.
// Body: { ttlHours?: number }  (1..72, default 24)
// Returns: { token, url, expiresAt }
//
// The token is HMAC-signed with the expiry embedded — no DB row needed
// to track issuance. To revoke, rotate NEXTAUTH_SECRET (nuclear).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { signPassportToken, PASSPORT_TOKEN_DEFAULTS } from '@/lib/pet-passport-token';
import { logAction, LOG_ACTIONS } from '@/lib/log';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  ttlHours: z.number().int().min(1).max(72).optional(),
}).strict();

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await params;
  const pet = await prisma.pet.findFirst({
    where: notDeleted({ id }),
    select: { id: true, ownerId: true, name: true },
  });
  if (!pet) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const isStaff = session.user.role === 'ADMIN' || session.user.role === 'SUPERADMIN';
  if (!isStaff && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  let parsed: z.infer<typeof bodySchema> = {};
  try {
    const raw = await request.json().catch(() => ({}));
    parsed = bodySchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'INVALID_BODY', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const ttlMs = (parsed.ttlHours ?? 24) * 3_600_000;
  const { token, expiresAt } = signPassportToken(pet.id, ttlMs);

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}/health-passport/${token}`;

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.PET_PASSPORT_SHARED,
    entityType: 'Pet',
    entityId: pet.id,
    details: {
      ttlHours: parsed.ttlHours ?? 24,
      expiresAtIso: expiresAt.toISOString(),
      issuedByRole: session.user.role,
    },
  }).catch(() => undefined);

  return NextResponse.json({
    token,
    url,
    expiresAt: expiresAt.toISOString(),
    expiresInMs: expiresAt.getTime() - Date.now(),
    maxTtlMs: PASSPORT_TOKEN_DEFAULTS.maxTtlMs,
  });
}
