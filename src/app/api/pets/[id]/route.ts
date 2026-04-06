import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const pet = await prisma.pet.findUnique({
    where: { id },
    include: {
      vaccinations: { orderBy: { date: 'desc' } },
      documents: { orderBy: { uploadedAt: 'desc' } },
      bookingPets: {
        include: {
          booking: {
            include: {
              boardingDetail: true,
              taxiDetail: true,
              invoice: true,
            },
          },
        },
        orderBy: { booking: { startDate: 'desc' } },
      },
    },
  });

  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Clients can only access their own pets
  if ((session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(pet);
}

export async function PATCH(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const pet = await prisma.pet.findUnique({ where: { id } });
  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if ((session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await _req.json();
    const {
      name, species, breed, dateOfBirth, gender, photoUrl,
      isNeutered, microchipNumber, tattooNumber, weight,
      vetName, vetPhone, allergies, currentMedication,
      behaviorWithDogs, behaviorWithCats, behaviorWithHumans, notes,
    } = body;

    const VALID_SPECIES = ['DOG', 'CAT'];
    const VALID_GENDERS = ['MALE', 'FEMALE'];

    if (species !== undefined && !VALID_SPECIES.includes(species)) {
      return NextResponse.json({ error: 'INVALID_SPECIES' }, { status: 400 });
    }
    if (gender && !VALID_GENDERS.includes(gender)) {
      return NextResponse.json({ error: 'INVALID_GENDER' }, { status: 400 });
    }
    if (dateOfBirth !== undefined) {
      const parsedDob = new Date(dateOfBirth);
      if (isNaN(parsedDob.getTime()) || parsedDob > new Date()) {
        return NextResponse.json({ error: 'INVALID_DATE_OF_BIRTH' }, { status: 400 });
      }
    }
    if (weight !== undefined && weight !== null && (isNaN(Number(weight)) || Number(weight) <= 0)) {
      return NextResponse.json({ error: 'INVALID_WEIGHT' }, { status: 400 });
    }

    const updated = await prisma.pet.update({
      where: { id },
      data: {
        name: name ? String(name).trim().slice(0, 100) : undefined,
        species,
        breed: breed ? String(breed).trim().slice(0, 100) : null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
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
      },
    });

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.PET_UPDATED,
      entityType: 'Pet',
      entityId: id,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update pet error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
