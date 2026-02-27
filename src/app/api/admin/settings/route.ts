import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';

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
};

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await prisma.setting.findMany();
  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json() as Record<string, string>;

  // Only allow known keys
  const allowedKeys = Object.keys(DEFAULT_SETTINGS);
  const updates = Object.entries(body).filter(([k]) => allowedKeys.includes(k));

  await Promise.all(
    updates.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
