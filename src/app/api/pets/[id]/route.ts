import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { petUpdateSchema, formatZodError } from '@/lib/validation';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const pet = await prisma.pet.findUnique({
    where: { id },
    select: {
      id: true, ownerId: true, name: true, species: true, breed: true,
      dateOfBirth: true, gender: true, photoUrl: true,
      isNeutered: true, microchipNumber: true, tattooNumber: true, weight: true,
      vetName: true, vetPhone: true, allergies: true, currentMedication: true,
      behaviorWithDogs: true, behaviorWithCats: true, behaviorWithHumans: true, notes: true,
      lastAntiparasiticDate: true, antiparasiticProduct: true, antiparasiticNotes: true,
      antiparasiticDurationDays: true,
      createdAt: true, updatedAt: true,
      vaccinations: {
        select: { id: true, vaccineType: true, date: true, comment: true, createdAt: true },
        orderBy: { date: 'desc' },
      },
      documents: { orderBy: { uploadedAt: 'desc' } },
      bookingPets: {
        select: {
          id: true,
          booking: {
            select: {
              id: true, status: true, serviceType: true,
              startDate: true, endDate: true, totalPrice: true,
              boardingDetail: { select: { includeGrooming: true, pricePerNight: true, groomingPrice: true } },
              taxiDetail: { select: { id: true, taxiType: true, price: true } },
              invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
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

  const pet = await prisma.pet.findUnique({ where: { id }, select: { id: true, ownerId: true } });
  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if ((session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const parsed = petUpdateSchema.safeParse(await _req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(formatZodError(parsed.error), { status: 400 });
    }
    const d = parsed.data;
    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPERADMIN';

    // Construit data en respectant la sémantique PATCH (undefined = laisser, null = reset)
    const data: Record<string, unknown> = {};
    if (d.name !== undefined)               data.name = d.name;
    if (d.species !== undefined)            data.species = d.species;
    if (d.breed !== undefined)              data.breed = d.breed;
    if (d.dateOfBirth !== undefined)        data.dateOfBirth = new Date(d.dateOfBirth);
    if (d.gender !== undefined)             data.gender = d.gender;
    if (d.photoUrl !== undefined)           data.photoUrl = d.photoUrl;
    if (d.isNeutered !== undefined)         data.isNeutered = d.isNeutered;
    if (d.microchipNumber !== undefined)    data.microchipNumber = d.microchipNumber;
    if (d.tattooNumber !== undefined)       data.tattooNumber = d.tattooNumber;
    if (d.weight !== undefined)             data.weight = d.weight;
    if (d.vetName !== undefined)            data.vetName = d.vetName;
    if (d.vetPhone !== undefined)           data.vetPhone = d.vetPhone;
    if (d.allergies !== undefined)          data.allergies = d.allergies;
    if (d.currentMedication !== undefined)  data.currentMedication = d.currentMedication;
    if (d.behaviorWithDogs !== undefined)   data.behaviorWithDogs = d.behaviorWithDogs;
    if (d.behaviorWithCats !== undefined)   data.behaviorWithCats = d.behaviorWithCats;
    if (d.behaviorWithHumans !== undefined) data.behaviorWithHumans = d.behaviorWithHumans;
    if (d.notes !== undefined)              data.notes = d.notes;
    if (d.lastAntiparasiticDate !== undefined) {
      data.lastAntiparasiticDate = d.lastAntiparasiticDate ? new Date(d.lastAntiparasiticDate) : null;
    }
    if (d.antiparasiticProduct !== undefined) data.antiparasiticProduct = d.antiparasiticProduct;
    if (d.antiparasiticNotes !== undefined)   data.antiparasiticNotes = d.antiparasiticNotes;
    // Admin-only override
    if (isAdmin && d.antiparasiticDurationDays !== undefined) {
      data.antiparasiticDurationDays = d.antiparasiticDurationDays;
    }

    const updated = await prisma.pet.update({
      where: { id },
      data,
    });

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.PET_UPDATED,
      entityType: 'Pet',
      entityId: id,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', service: 'pet', message: 'Update pet error', error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
