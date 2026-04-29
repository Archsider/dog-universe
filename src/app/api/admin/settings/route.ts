import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { invalidateCapacityCache } from '@/lib/capacity';

const DEFAULT_SETTINGS: Record<string, string> = {
  boarding_dog_per_night: '120',
  boarding_cat_per_night: '70',
  boarding_dog_long_stay: '100',
  boarding_dog_multi: '100',
  long_stay_threshold: '32',
  grooming_small_dog: '100',
  grooming_large_dog: '150',
  taxi_standard: '150',
  taxi_vet: '300',
  taxi_airport: '300',
  capacity_dog: '50',
  capacity_cat: '10',
};

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await prisma.setting?.findMany() ?? [];
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json() as Record<string, string>;

  // Only allow known keys with positive numeric values
  const allowedKeys = Object.keys(DEFAULT_SETTINGS);
  const updates = Object.entries(body)
    .filter(([k]) => allowedKeys.includes(k))
    .filter(([, v]) => {
      const parsed = Number(v);
      return !isNaN(parsed) && parsed > 0;
    });

  if (updates.length === 0) return NextResponse.json({ ok: true });
  if (!prisma.setting) return NextResponse.json({ ok: true });

  await Promise.all(
    updates.map(([key, value]) =>
      prisma.setting!.upsert({
        where: { key },
        update: { value: String(Number(value)) },
        create: { key, value: String(Number(value)) },
      })
    )
  );

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.SETTINGS_UPDATED,
    entityType: 'Setting',
    details: Object.fromEntries(updates),
  });

  // Invalidate capacity cache if any capacity key was updated
  const hasCapacityUpdate = updates.some(([k]) => k === 'capacity_dog' || k === 'capacity_cat');
  if (hasCapacityUpdate) {
    await invalidateCapacityCache();
  }

  return NextResponse.json({ ok: true });
}
