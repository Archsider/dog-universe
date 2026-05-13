import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import {
  getAgeCategory,
  getMatchingProductsForPet,
  type Species,
} from '@/lib/pet-profile';
import { notDeleted } from '@/lib/prisma-soft';

/**
 * GET /api/client/products/suggestions?bookingId=xxx
 * Retourne les produits recommandés pour chaque animal du booking,
 * groupés par pet. Le client doit être propriétaire (sauf admin).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = request.nextUrl.searchParams.get('bookingId');
  if (!bookingId) return NextResponse.json({ error: 'MISSING_BOOKING_ID' }, { status: 400 });

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    select: {
      id: true,
      clientId: true,
      bookingPets: {
        select: {
          pet: { select: { id: true, name: true, species: true, dateOfBirth: true } },
        },
      },
    },
  });
  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPERADMIN';
  if (!isAdmin && booking.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const suggestions = await Promise.all(
    booking.bookingPets.map(async (bp) => {
      const species = bp.pet.species as Species;
      const ageCategory = getAgeCategory(bp.pet.dateOfBirth, species);
      const all = await getMatchingProductsForPet({
        id: bp.pet.id,
        species,
        dateOfBirth: bp.pet.dateOfBirth,
      });
      return {
        pet: { id: bp.pet.id, name: bp.pet.name, species, ageCategory },
        recommended: all.slice(0, 3),
        all,
      };
    }),
  );

  return NextResponse.json({ suggestions });
}
