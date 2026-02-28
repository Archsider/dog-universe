import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';
  const species = searchParams.get('species') ?? '';

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { breed: { contains: search, mode: 'insensitive' } },
      { owner: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  if (species) where.species = species;

  const pets = await prisma.pet.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, email: true } },
      vaccinations: { orderBy: { date: 'desc' }, take: 5 },
      documents: { orderBy: { uploadedAt: 'desc' }, take: 3 },
      _count: { select: { bookingPets: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(pets);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ownerId, name, species, breed, gender, dateOfBirth } = await request.json();

  if (!ownerId || !name || !species) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const owner = await prisma.user.findUnique({ where: { id: ownerId, role: 'CLIENT' } });
  if (!owner) return NextResponse.json({ error: 'Owner not found' }, { status: 404 });

  const pet = await prisma.pet.create({
    data: {
      ownerId,
      name: name.trim(),
      species,
      breed: breed?.trim() || null,
      gender: gender || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    },
  });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.PET_CREATED,
    entityType: 'Pet',
    entityId: pet.id,
    details: { name: pet.name, species, ownerId, createdByAdmin: true },
  });

  return NextResponse.json(pet, { status: 201 });
}
