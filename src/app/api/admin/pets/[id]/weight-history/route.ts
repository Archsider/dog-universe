import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { notDeleted } from '@/lib/prisma-soft';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  const { id } = await params;

  const entries = await prisma.petWeightEntry.findMany({
    where: { petId: id },
    orderBy: { measuredAt: 'desc' },
    take: 500,
  });

  return NextResponse.json(entries);
}

export async function POST(req: Request, { params }: Params) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;

  const pet = await prisma.pet.findFirst({ where: notDeleted({ id }), select: { id: true, name: true } });
  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { weightKg, measuredAt, note } = body;

  if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 200) {
    return NextResponse.json({ error: 'INVALID_WEIGHT' }, { status: 400 });
  }
  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 500) || null : null;

  let resolvedDate: Date = new Date();
  if (measuredAt) {
    const d = new Date(measuredAt);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'INVALID_DATE' }, { status: 400 });
    resolvedDate = d;
  }

  // Create entry and update Pet.weight (current weight) in a transaction
  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.petWeightEntry.create({
      data: {
        petId: id,
        weightKg,
        measuredAt: resolvedDate,
        note: cleanNote,
      },
    });

    // Update Pet.weight to reflect the latest measurement
    // Only update if this entry is the most recent one
    const latestEntry = await tx.petWeightEntry.findFirst({
      where: { petId: id },
      orderBy: { measuredAt: 'desc' },
    });
    if (latestEntry?.id === created.id) {
      await tx.pet.update({
        where: { id },
        data: { weight: weightKg },
      });
    }

    return created;
  });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.PET_UPDATED,
    entityType: 'Pet',
    entityId: id,
    details: { action: 'WEIGHT_ENTRY_ADDED', weightKg, measuredAt: resolvedDate.toISOString() },
  });

  return NextResponse.json(entry, { status: 201 });
}
