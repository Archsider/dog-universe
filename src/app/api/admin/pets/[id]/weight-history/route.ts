import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const entries = await prisma.petWeightEntry.findMany({
    where: { petId: id },
    orderBy: { measuredAt: 'desc' },
  });

  return NextResponse.json(entries);
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const pet = await prisma.pet.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { weightKg, measuredAt, note } = body;

  if (typeof weightKg !== 'number' || weightKg <= 0) {
    return NextResponse.json({ error: 'INVALID_WEIGHT' }, { status: 400 });
  }

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
        note: note?.trim() || null,
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
