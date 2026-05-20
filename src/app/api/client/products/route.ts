import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { toNumber } from '@/lib/decimal';

// GET /api/client/products
//
// Returns the active product catalog.  When `?bookingId=` is provided AND
// the booking belongs to the caller, the result is pre-filtered to species
// matching the booking's pets — so a CAT-only booking never sees DOG-only
// products.  Also exposes `targetSpecies` / `imageUrl` / `weight` so the
// client UI can render filter chips + product images.
//
// Source : Wave 5 polish round 2 (user feedback : 'tout mélangé chien/chat,
// pas de filtre').

export async function GET(req: NextRequest) {
  const guard = await requireRole(['CLIENT']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const bookingId = req.nextUrl.searchParams.get('bookingId');

  let speciesFilter: ('DOG' | 'CAT')[] | null = null;
  if (bookingId) {
    const booking = await prisma.booking.findFirst({
      where: notDeleted({ id: bookingId, clientId: session.user.id }),
      select: {
        bookingPets: {
          select: { pet: { select: { species: true } } },
        },
      },
    });
    if (booking) {
      const speciesSet = new Set<'DOG' | 'CAT'>();
      for (const bp of booking.bookingPets) {
        const sp = bp.pet?.species;
        if (sp === 'DOG' || sp === 'CAT') speciesSet.add(sp);
      }
      if (speciesSet.size > 0) speciesFilter = [...speciesSet];
    }
  }

  // Build the where : if we know the booking's species, only show matching
  // products (+ BOTH-targeted ones).  Otherwise return the full catalog.
  const where = {
    available: true,
    stock: { gt: 0 },
    isArchived: false,
    ...(speciesFilter
      ? { targetSpecies: { in: [...speciesFilter, 'BOTH'] as string[] } }
      : {}),
  };

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take: 500,
  });

  return NextResponse.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      reference: p.reference,
      category: p.category,
      price: toNumber(p.price),
      stock: p.stock,
      targetSpecies: p.targetSpecies,
      targetAge: p.targetAge,
      imageUrl: p.imageUrl,
      weight: p.weight,
      description: p.description,
    })),
    {
      headers: { 'Cache-Control': 'private, max-age=30' },
    },
  );
}
