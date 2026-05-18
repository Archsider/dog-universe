import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { notDeleted } from '@/lib/prisma-soft';
import { withSpan } from '@/lib/observability';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;

  const pet = await prisma.pet.findUnique({ where: notDeleted({ id }) });
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
  await withSpan(
    'api.admin.animals.softDelete',
    { petId: id, actorId: session.user.id, species: pet.species },
    () => prisma.pet.update({ where: { id }, data: { deletedAt: new Date() } }),
  );

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.PET_SOFT_DELETED,
    entityType: 'Pet',
    entityId: id,
    details: { name: pet.name, species: pet.species },
  });

  return NextResponse.json({ message: 'deleted' });
}
