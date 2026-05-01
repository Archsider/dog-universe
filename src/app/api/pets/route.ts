import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { petCreateSchema, formatZodError } from '@/lib/validation';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pets = await prisma.pet.findMany({
    where: { ownerId: session.user.id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
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
    take: 100,
  });

  return NextResponse.json(pets);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const parsed = petCreateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(formatZodError(parsed.error), { status: 400 });
    }
    const d = parsed.data;

    const pet = await prisma.pet.create({
      data: {
        ownerId: session.user.id,
        name: d.name,
        species: d.species,
        breed: d.breed ?? null,
        dateOfBirth: new Date(d.dateOfBirth),
        gender: d.gender ?? null,
        photoUrl: d.photoUrl ?? null,
        isNeutered: d.isNeutered ?? null,
        microchipNumber: d.microchipNumber ?? null,
        tattooNumber: d.tattooNumber ?? null,
        weight: d.weight ?? null,
        vetName: d.vetName ?? null,
        vetPhone: d.vetPhone ?? null,
        allergies: d.allergies ?? null,
        currentMedication: d.currentMedication ?? null,
        behaviorWithDogs: d.behaviorWithDogs ?? null,
        behaviorWithCats: d.behaviorWithCats ?? null,
        behaviorWithHumans: d.behaviorWithHumans ?? null,
        notes: d.notes ?? null,
        lastAntiparasiticDate: d.lastAntiparasiticDate ? new Date(d.lastAntiparasiticDate) : null,
        antiparasiticProduct: d.antiparasiticProduct ?? null,
        antiparasiticNotes: d.antiparasiticNotes ?? null,
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
    console.error(JSON.stringify({ level: 'error', service: 'pet', message: 'Create pet error', error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
