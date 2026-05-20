// GET /api/admin/push/status — Returns the VAPID public key + current
// subscription count for the caller.  Used by the UI toggle to know
// whether to show "Activate" or "Disable".

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  const subscriptions = publicKey
    ? await prisma.pushSubscription.count({ where: { userId: session.user.id } })
    : 0;

  return NextResponse.json({
    configured: !!publicKey,
    publicKey,
    subscriptions,
  });
}
