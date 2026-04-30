import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { getPricingSettings, calculateBoardingBreakdown, calculateTaxiPrice } from '@/lib/pricing';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    include: {
      bookingPets: { include: { pet: { select: { id: true, name: true, species: true } } } },
      boardingDetail: true,
      taxiDetail: true,
      bookingItems: true,
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const pricing = await getPricingSettings();
  const pets = booking.bookingPets.map(bp => bp.pet);

  if (booking.serviceType === 'BOARDING' && booking.boardingDetail) {
    const bd = booking.boardingDetail;
    const nights = booking.endDate
      ? Math.max(0, Math.floor((booking.endDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    // Build grooming map for dogs that have grooming
    const groomingMap: Record<string, 'SMALL' | 'LARGE'> = {};
    if (bd.includeGrooming && bd.groomingSize) {
      const dogs = pets.filter(p => p.species === 'DOG');
      dogs.forEach(dog => { groomingMap[dog.id] = bd.groomingSize as 'SMALL' | 'LARGE'; });
    }

    const breakdown = calculateBoardingBreakdown(
      nights,
      pets,
      bd.includeGrooming ? groomingMap : undefined,
      bd.taxiGoEnabled,
      bd.taxiReturnEnabled,
      pricing,
    );

    const items = breakdown.items.map(item => ({
      description: item.descriptionFr,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    }));

    // Append admin-defined extra lines
    for (const bi of booking.bookingItems) {
      items.push({ description: bi.description, quantity: bi.quantity, unitPrice: bi.unitPrice, total: bi.total });
    }

    return NextResponse.json({ items });
  }

  if (booking.serviceType === 'PET_TAXI' && booking.taxiDetail) {
    const taxiType = booking.taxiDetail.taxiType as 'STANDARD' | 'VET' | 'AIRPORT';
    const breakdown = calculateTaxiPrice(taxiType, pricing);
    const items = breakdown.items.map(item => ({
      description: item.descriptionFr,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    }));

    // Append admin-defined extra lines
    for (const bi of booking.bookingItems) {
      items.push({ description: bi.description, quantity: bi.quantity, unitPrice: bi.unitPrice, total: bi.total });
    }

    return NextResponse.json({ items });
  }

  // Fallback: return only extra lines if no service detail found
  const items = booking.bookingItems.map(bi => ({
    description: bi.description,
    quantity: bi.quantity,
    unitPrice: bi.unitPrice,
    total: bi.total,
  }));
  return NextResponse.json({ items });
}
