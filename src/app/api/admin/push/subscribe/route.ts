// POST /api/admin/push/subscribe — ADMIN or SUPERADMIN.
//
// Persists a browser's PushSubscription { endpoint, keys.p256dh, keys.auth }
// so the server can later fan-out push notifications via web-push.
// Idempotent : if the endpoint already exists for this user, returns 200
// without re-inserting (browsers refresh subs periodically).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(50).max(200),
    auth:   z.string().min(20).max(100),
  }),
  userAgent: z.string().max(500).optional(),
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

  await prisma.pushSubscription.upsert({
    where: { userId_endpoint: { userId: session.user.id, endpoint: body.endpoint } },
    update: {
      p256dh: body.keys.p256dh,
      auth:   body.keys.auth,
      userAgent: body.userAgent ?? null,
      lastUsed: new Date(),
    },
    create: {
      userId: session.user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth:   body.keys.auth,
      userAgent: body.userAgent ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
