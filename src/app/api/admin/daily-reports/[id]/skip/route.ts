// POST /api/admin/daily-reports/[id]/skip
//
// Mark a DRAFT report as SKIPPED — no email, no notification, no spam to
// the client.  Useful when nothing notable happened on a quiet day, or
// when the pet went home mid-day.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().max(280).optional(),
}).strict();

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  let reason: string | undefined;
  try {
    const parsed = bodySchema.parse(await req.json().catch(() => ({})));
    reason = parsed.reason;
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const existing = await prisma.dailyReport.findUnique({
    where: { id },
    select: { status: true, petId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (existing.status !== 'DRAFT') {
    return NextResponse.json({ error: 'NOT_DRAFT' }, { status: 409 });
  }

  await prisma.dailyReport.update({
    where: { id },
    data: { status: 'SKIPPED', skipReason: reason ?? null },
  });

  await logAction({
    userId: session.user.id,
    action: 'DAILY_REPORT_SKIPPED',
    entityType: 'DailyReport',
    entityId: id,
    details: { reason: reason ?? null, petId: existing.petId },
  });

  return NextResponse.json({ ok: true });
}
