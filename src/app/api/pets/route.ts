import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pets = await prisma.pet.findMany({
    where: { ownerId: session.user.id },
    include: {
      vaccinations: { orderBy: { date: 'desc' } },
      documents: { orderBy: { uploadedAt: 'desc' } },
      _count: { select: { bookingPets: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(pets);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, species, breed, dateOfBirth, gender, photoUrl } = body;

    if (!name || !species) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
    }

    const pet = await prisma.pet.create({
      data: {
        ownerId: session.user.id,
        name: name.trim(),
        species,
        breed: breed?.trim() || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender || null,
        photoUrl: photoUrl || null,
      },
    });

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.PET_CREATED,
      entityType: 'Pet',
      entityId: pet.id,
      details: { name: pet.name, species: pet.species },
    });

    return NextResponse.json(pet, { status: 201 });
  } catch (error) {
    console.error('Create pet error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
