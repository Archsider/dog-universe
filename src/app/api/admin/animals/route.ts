import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';
  const species = searchParams.get('species') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '50')), 100);

  const where: Record<string, unknown> = { deletedAt: null };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { breed: { contains: search, mode: 'insensitive' } },
      { owner: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const VALID_SPECIES = ['DOG', 'CAT'];
  if (species && VALID_SPECIES.includes(species)) where.species = species;

  const [pets, total] = await Promise.all([
    prisma.pet.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        vaccinations: { select: { id: true, vaccineType: true, date: true }, orderBy: { date: 'desc' }, take: 5 },
        documents: { orderBy: { uploadedAt: 'desc' }, take: 3 },
        _count: { select: { bookingPets: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.pet.count({ where }),
  ]);

  return NextResponse.json({ pets, total, page, limit });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ownerId, name, species, breed, gender, dateOfBirth, weight } = await request.json();

  if (!ownerId || !name || !species || !dateOfBirth) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  if (gender && !['MALE', 'FEMALE'].includes(gender)) {
    return NextResponse.json({ error: 'INVALID_GENDER' }, { status: 400 });
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
      weight: weight ? Number(weight) : null,
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
