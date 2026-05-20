// POST /api/admin/push/unsubscribe — ADMIN or SUPERADMIN.
//
// Drops the subscription matching the provided endpoint.  Called from the
// browser after PushManager.unsubscribe() succeeds locally.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  endpoint: z.string().url().max(2048),
}).strict();

export async function POST(req: NextRequest) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: { userId: session.user.id, endpoint: body.endpoint },
  });

  return NextResponse.json({ ok: true });
}
