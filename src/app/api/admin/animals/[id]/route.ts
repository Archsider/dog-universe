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

  const pet = await prisma.pet.findUnique({ where: { id, deletedAt: null } }); // soft-delete: required — no global extension (Edge Runtime incompatible)
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

  // Soft-delete — préserve l'historique des réservations passées
  await prisma.pet.update({ where: { id }, data: { deletedAt: new Date() } });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.PET_SOFT_DELETED,
    entityType: 'Pet',
    entityId: id,
    details: { name: pet.name, species: pet.species },
  });

  return NextResponse.json({ message: 'deleted' });
}
