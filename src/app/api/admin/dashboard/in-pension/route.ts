// GET /api/admin/dashboard/in-pension
//
// The named list behind the "X dans nos murs" greeting counter — same
// population as the dashboard occupancy count (loaders/pension.ts) :
// BOARDING + IN_PROGRESS (strict, physical kennel state), one row per pet.
// Lazy-fetched by <InPensionPopover> only when the operator opens it.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  const bookings = await prisma.booking.findMany({
    where: notDeleted({ serviceType: 'BOARDING', status: 'IN_PROGRESS' }),
    select: {
      id: true,
      endDate: true,
      isOpenEnded: true,
      client: { select: { name: true } },
      bookingPets: { select: { pet: { select: { id: true, name: true, species: true } } } },
    },
    orderBy: { endDate: 'asc' },
    // Cap défensif : la pension réelle dépasse rarement quelques dizaines
    // d'animaux ; protège contre un IN_PROGRESS jamais clôturé qui gonflerait
    // la réponse (parité avec les autres findMany cappés du dashboard).
    take: 200,
  });

  const pets: Array<{
    bookingId: string;
    petId: string;
    petName: string;
    species: string;
    clientName: string;
    endDate: string | null;
    isOpenEnded: boolean;
  }> = [];

  for (const b of bookings) {
    for (const bp of b.bookingPets) {
      if (!bp.pet) continue;
      pets.push({
        bookingId: b.id,
        petId: bp.pet.id,
        petName: bp.pet.name,
        species: bp.pet.species,
        clientName: b.client?.name ?? '—',
        endDate: b.endDate ? b.endDate.toISOString() : null,
        isOpenEnded: b.isOpenEnded,
      });
    }
  }

  return NextResponse.json({ pets });
}
