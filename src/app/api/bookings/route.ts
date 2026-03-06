import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBookingConfirmationNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { formatDate } from '@/lib/utils';
import { checkRateLimit, getIp } from '@/lib/ratelimit';
import {
  getPricingSettings,
  calculateBoardingBreakdown,
  calculateTaxiPrice,
  getGroomingPriceForPet,
} from '@/lib/pricing';
import type { GroomingSize, TaxiType } from '@/lib/pricing';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const clientId = searchParams.get('clientId');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));

  const where: Record<string, unknown> = {};

  if (session.user.role === 'CLIENT') {
    where.clientId = session.user.id;
  } else if (clientId) {
    where.clientId = clientId;
  }

  if (status) where.status = status;

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, email: true } },
        bookingPets: { include: { pet: true } },
        boardingDetail: true,
        taxiDetail: true,
        invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
      },
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return NextResponse.json({ bookings, total, page, limit });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit clients: max 10 bookings per hour per user
  if (session.user.role === 'CLIENT') {
    const rl = checkRateLimit(`booking:${session.user.id}`, 10, 60 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT', message: 'Too many booking requests. Please try again later.' },
        { status: 429 }
      );
    }
  }

  try {
    const body = await request.json();
    const {
      serviceType,
      petIds,
      startDate,
      endDate,
      arrivalTime,
      notes,
      // Boarding specific
      includeGrooming,
      groomingSize,
      pricePerNight,
      // Boarding taxi addon
      taxiGoEnabled,
      taxiGoDate,
      taxiGoTime,
      taxiGoAddress,
      taxiReturnEnabled,
      taxiReturnDate,
      taxiReturnTime,
      taxiReturnAddress,
      // Taxi specific
      taxiType,
    } = body;

    if (!serviceType || !petIds?.length || !startDate) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
    }

    // Verify pets belong to this client
    if (session.user.role === 'CLIENT') {
      const pets = await prisma.pet.findMany({
        where: { id: { in: petIds }, ownerId: session.user.id },
      });
      if (pets.length !== petIds.length) {
        return NextResponse.json({ error: 'INVALID_PETS' }, { status: 400 });
      }
    }

    // Fetch pets with species — used for pricing and capacity checks
    const petsForPricing = await prisma.pet.findMany({
      where: { id: { in: petIds } },
      select: { id: true, name: true, species: true },
    });

    // Conflict detection for BOARDING: check pet availability + capacity
    if (serviceType === 'BOARDING' && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Check if any of the requested pets are already in an active boarding for overlapping dates
      const petConflicts = await prisma.bookingPet.findMany({
        where: {
          petId: { in: petIds },
          booking: {
            serviceType: 'BOARDING',
            status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
            startDate: { lt: end },
            endDate: { gt: start },
          },
        },
        include: { pet: { select: { name: true } } },
      });

      if (petConflicts.length > 0) {
        const conflictedNames = [...new Set(petConflicts.map(c => c.pet.name))].join(', ');
        return NextResponse.json(
          { error: 'PET_ALREADY_BOOKED', message: conflictedNames },
          { status: 409 }
        );
      }

      // Check boarding capacity from settings
      const [dogCapSetting, catCapSetting] = await Promise.all([
        prisma.setting.findUnique({ where: { key: 'capacity_dog' } }),
        prisma.setting.findUnique({ where: { key: 'capacity_cat' } }),
      ]);
      const dogCapacity = parseInt(dogCapSetting?.value ?? '10');
      const catCapacity = parseInt(catCapSetting?.value ?? '5');

      // Count active boarders during the requested period (2 aggregation queries instead of N+1)
      const overlapFilter = {
        serviceType: 'BOARDING' as const,
        status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        startDate: { lt: end },
        endDate: { gt: start },
      };
      const [currentDogs, currentCats] = await Promise.all([
        prisma.bookingPet.count({ where: { pet: { species: 'DOG' }, booking: overlapFilter } }),
        prisma.bookingPet.count({ where: { pet: { species: 'CAT' }, booking: overlapFilter } }),
      ]);

      const requestedDogs = petsForPricing.filter(p => p.species === 'DOG').length;
      const requestedCats = petsForPricing.filter(p => p.species === 'CAT').length;

      if (currentDogs + requestedDogs > dogCapacity) {
        return NextResponse.json({ error: 'CAPACITY_DOGS_FULL' }, { status: 409 });
      }
      if (currentCats + requestedCats > catCapacity) {
        return NextResponse.json({ error: 'CAPACITY_CATS_FULL' }, { status: 409 });
      }
    }

    // Server-side price computation
    const pricing = await getPricingSettings();
    let totalPrice = 0;
    let computedGroomingPrice = 0;
    let computedTaxiAddonPrice = 0;

    if (serviceType === 'BOARDING' && endDate) {
      const nights = Math.round(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000
      );
      const groomingMap: Record<string, GroomingSize> = {};
      if (includeGrooming && groomingSize) {
        petsForPricing
          .filter(p => p.species === 'DOG')
          .forEach(dog => { groomingMap[dog.id] = groomingSize as GroomingSize; });
      }
      const breakdown = calculateBoardingBreakdown(
        nights,
        petsForPricing,
        includeGrooming ? groomingMap : undefined,
        taxiGoEnabled,
        taxiReturnEnabled,
        pricing,
      );
      totalPrice = breakdown.total;
      computedGroomingPrice = breakdown.items
        .filter(i => i.descriptionEn.startsWith('Grooming'))
        .reduce((s, i) => s + i.total, 0);
      computedTaxiAddonPrice = breakdown.items
        .filter(i => i.descriptionEn.startsWith('Pet Taxi'))
        .reduce((s, i) => s + i.total, 0);
    } else if (serviceType === 'PET_TAXI') {
      const breakdown = calculateTaxiPrice((taxiType ?? 'STANDARD') as TaxiType, pricing);
      totalPrice = breakdown.total;
    }

    const clientId = session.user.role === 'CLIENT' ? session.user.id : body.clientId;
    const year = new Date().getFullYear();

    // Generate unique booking reference atomically inside a transaction
    const { booking, bookingRef } = await prisma.$transaction(async (tx) => {
      const count = await tx.booking.count();
      const ref = `DU-${year}-${String(count + 1).padStart(4, '0')}`;
      const b = await tx.booking.create({
        data: {
          clientId,
          serviceType,
          status: ['ADMIN', 'SUPERADMIN'].includes(session.user.role) ? 'CONFIRMED' : 'PENDING',
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          arrivalTime: arrivalTime || null,
          notes: notes?.trim() || null,
          totalPrice: totalPrice ?? 0,
          bookingPets: {
            create: petIds.map((petId: string) => ({ petId })),
          },
        },
        include: {
          bookingPets: { include: { pet: true } },
          client: true,
        },
      });
      return { booking: b, bookingRef: ref };
    });

    // Create service-specific details
    if (serviceType === 'BOARDING') {
      await prisma.boardingDetail.create({
        data: {
          bookingId: booking.id,
          includeGrooming: includeGrooming ?? false,
          groomingSize: groomingSize || null,
          groomingPrice: computedGroomingPrice,
          pricePerNight: pricePerNight ?? 0,
          taxiGoEnabled: taxiGoEnabled ?? false,
          taxiGoDate: taxiGoDate || null,
          taxiGoTime: taxiGoTime || null,
          taxiGoAddress: taxiGoAddress || null,
          taxiReturnEnabled: taxiReturnEnabled ?? false,
          taxiReturnDate: taxiReturnDate || null,
          taxiReturnTime: taxiReturnTime || null,
          taxiReturnAddress: taxiReturnAddress || null,
          taxiAddonPrice: computedTaxiAddonPrice,
        },
      });
    } else if (serviceType === 'PET_TAXI') {
      await prisma.taxiDetail.create({
        data: {
          bookingId: booking.id,
          taxiType: taxiType ?? 'STANDARD',
          price: totalPrice,
        },
      });
    }

    // Send notifications and emails
    const petNames = booking.bookingPets.map((bp) => bp.pet.name).join(', ');
    const locale = booking.client.language ?? 'fr';

    await createBookingConfirmationNotification(
      booking.clientId,
      bookingRef,
      petNames
    );

    const serviceName = serviceType === 'BOARDING'
      ? (locale === 'fr' ? 'Pension' : 'Boarding')
      : (locale === 'fr' ? 'Taxi animalier' : 'Pet Taxi');

    const { subject, html } = getEmailTemplate('booking_confirmation', {
      clientName: booking.client.name,
      bookingRef,
      service: serviceName,
      petName: petNames,
    }, locale);

    await sendEmail({ to: booking.client.email, subject, html });

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_CREATED,
      entityType: 'Booking',
      entityId: booking.id,
      details: { bookingRef, serviceType, totalPrice },
    });

    return NextResponse.json({ ...booking, bookingRef }, { status: 201 });
  } catch (error) {
    console.error('Create booking error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
