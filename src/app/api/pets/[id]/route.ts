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
  if (session.user.role !== 'ADMIN' && pet.ownerId !== session.user.id) {
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

  if (session.user.role !== 'ADMIN' && pet.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await _req.json();
    const { name, species, breed, dateOfBirth, gender, photoUrl } = body;

    const updated = await prisma.pet.update({
      where: { id },
      data: {
        name: name?.trim(),
        species,
        breed: breed?.trim() || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender || null,
        photoUrl: photoUrl || null,
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
