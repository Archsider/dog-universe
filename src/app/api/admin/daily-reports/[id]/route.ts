// PATCH /api/admin/daily-reports/[id]
//
// Update DRAFT content (photos, emojis, note).  Refuses to mutate SENT or
// SKIPPED reports — only DRAFT is editable.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  photoUrls: z.array(z.string().url().max(1000)).max(3).optional(),
  moodEmoji: z.string().max(10).nullable().optional(),
  foodEmoji: z.string().max(10).nullable().optional(),
  sleepEmoji: z.string().max(10).nullable().optional(),
  playEmoji: z.string().max(10).nullable().optional(),
  note: z.string().max(280).nullable().optional(),
}).strict();

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  let payload;
  try {
    payload = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const existing = await prisma.dailyReport.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (existing.status !== 'DRAFT') {
    return NextResponse.json({ error: 'NOT_DRAFT' }, { status: 409 });
  }

  const updated = await prisma.dailyReport.update({
    where: { id },
    data: payload,
    select: {
      id: true,
      photoUrls: true,
      moodEmoji: true,
      foodEmoji: true,
      sleepEmoji: true,
      playEmoji: true,
      note: true,
      status: true,
    },
  });

  return NextResponse.json(updated);
}
