import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pets = await prisma.pet.findMany({
    where: { ownerId: session.user.id },
    select: {
      id: true, ownerId: true, name: true, species: true, breed: true,
      dateOfBirth: true, gender: true, photoUrl: true,
      isNeutered: true, microchipNumber: true, tattooNumber: true, weight: true,
      vetName: true, vetPhone: true, allergies: true, currentMedication: true,
      behaviorWithDogs: true, behaviorWithCats: true, behaviorWithHumans: true, notes: true,
      createdAt: true, updatedAt: true,
      vaccinations: {
        select: { id: true, vaccineType: true, date: true, comment: true, createdAt: true },
        orderBy: { date: 'desc' },
      },
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
    const {
      name, species, breed, dateOfBirth, gender, photoUrl,
      isNeutered, microchipNumber, tattooNumber, weight,
      vetName, vetPhone, allergies, currentMedication,
      behaviorWithDogs, behaviorWithCats, behaviorWithHumans, notes,
      lastAntiparasiticDate, antiparasiticProduct, antiparasiticNotes,
    } = body;

    const VALID_SPECIES = ['DOG', 'CAT'];
    const VALID_GENDERS = ['MALE', 'FEMALE'];

    if (!name || !species || !dateOfBirth) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
    }
    if (!VALID_SPECIES.includes(species)) {
      return NextResponse.json({ error: 'INVALID_SPECIES' }, { status: 400 });
    }
    if (gender && !VALID_GENDERS.includes(gender)) {
      return NextResponse.json({ error: 'INVALID_GENDER' }, { status: 400 });
    }
    const parsedDob = new Date(dateOfBirth);
    if (isNaN(parsedDob.getTime()) || parsedDob > new Date()) {
      return NextResponse.json({ error: 'INVALID_DATE_OF_BIRTH' }, { status: 400 });
    }
    if (weight !== undefined && weight !== null && (isNaN(Number(weight)) || Number(weight) <= 0)) {
      return NextResponse.json({ error: 'INVALID_WEIGHT' }, { status: 400 });
    }

    const pet = await prisma.pet.create({
      data: {
        ownerId: session.user.id,
        name: String(name).trim().slice(0, 100),
        species,
        breed: breed ? String(breed).trim().slice(0, 100) : null,
        dateOfBirth: parsedDob,
        gender: gender || null,
        photoUrl: photoUrl || null,
        isNeutered: isNeutered ?? null,
        microchipNumber: microchipNumber?.trim() || null,
        tattooNumber: tattooNumber?.trim() || null,
        weight: weight ? Number(weight) : null,
        vetName: vetName?.trim() || null,
        vetPhone: vetPhone?.trim() || null,
        allergies: allergies?.trim() || null,
        currentMedication: currentMedication?.trim() || null,
        behaviorWithDogs: behaviorWithDogs || null,
        behaviorWithCats: behaviorWithCats || null,
        behaviorWithHumans: behaviorWithHumans || null,
        notes: notes?.trim() || null,
        lastAntiparasiticDate: lastAntiparasiticDate ? new Date(lastAntiparasiticDate) : null,
        antiparasiticProduct: antiparasiticProduct?.trim() || null,
        antiparasiticNotes: antiparasiticNotes?.trim() || null,
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
