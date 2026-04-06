import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const pet = await prisma.pet.findUnique({ where: { id } });
  if (!pet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Block deletion if pet has active or upcoming bookings
  const activeBookingCount = await prisma.bookingPet.count({
    where: {
      petId: id,
      booking: { status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } },
    },
  });
  if (activeBookingCount > 0) {
    return NextResponse.json(
      { error: 'Cannot delete a pet with active bookings' },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // Remove this pet from any bookings (don't delete the bookings)
    await tx.bookingPet.deleteMany({ where: { petId: id } });

    // Admin notes about this pet
    await tx.adminNote.deleteMany({ where: { entityType: 'PET', entityId: id } });

    // Pet (cascades vaccinations, documents)
    await tx.pet.delete({ where: { id } });
  });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.PET_DELETED,
    entityType: 'Pet',
    entityId: id,
    details: { name: pet.name, species: pet.species },
  });

  return NextResponse.json({ message: 'deleted' });
}
