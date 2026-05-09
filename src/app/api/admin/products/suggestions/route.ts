import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import {
  getAgeCategory,
  getMatchingProductsForPet,
  type Species,
} from '@/lib/pet-profile';

/**
 * GET /api/admin/products/suggestions?bookingId=xxx[&includeOutOfStock=1]
 * Version admin — accès à n'importe quel booking, option d'inclure les
 * produits en rupture (utile pour suggérer une commande future).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bookingId = request.nextUrl.searchParams.get('bookingId');
  if (!bookingId) return NextResponse.json({ error: 'MISSING_BOOKING_ID' }, { status: 400 });

  const includeOutOfStock = request.nextUrl.searchParams.get('includeOutOfStock') === '1';

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    select: {
      id: true,
      bookingPets: {
        select: {
          pet: { select: { id: true, name: true, species: true, dateOfBirth: true } },
        },
      },
    },
  });
  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const suggestions = await Promise.all(
    booking.bookingPets.map(async (bp) => {
      const species = bp.pet.species as Species;
      const ageCategory = getAgeCategory(bp.pet.dateOfBirth, species);
      const all = await getMatchingProductsForPet(
        { id: bp.pet.id, species, dateOfBirth: bp.pet.dateOfBirth },
        { includeOutOfStock },
      );
      return {
        pet: { id: bp.pet.id, name: bp.pet.name, species, ageCategory },
        recommended: all.slice(0, 3),
        all,
      };
    }),
  );

  return NextResponse.json({ suggestions });
}
