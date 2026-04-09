import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBookingConfirmationNotification, notifyAdminsNewBooking } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { formatDate } from '@/lib/utils';
import { getPricingSettings, calculateBoardingBreakdown, calculateTaxiPrice } from '@/lib/pricing';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const clientId = searchParams.get('clientId');

  const where: Record<string, unknown> = {};

  if (session.user.role === 'CLIENT') {
    where.clientId = session.user.id;
  } else if (clientId) {
    where.clientId = clientId;
  }

  const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED'];
  if (status && VALID_STATUSES.includes(status)) where.status = status;

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, email: true } },
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
    },
    orderBy: { startDate: 'desc' },
  });

  return NextResponse.json(bookings);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const {
      serviceType,
      petIds,
      startDate,
      endDate,
      arrivalTime,
      notes,
      totalPrice,
      source,
      // Boarding specific
      includeGrooming,
      groomingSize,
      groomingPrice,
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
      taxiAddonPrice,
      // Taxi specific
      taxiType,
      // Extra billable lines (admin only)
      bookingItems,
    } = body;

    const VALID_SERVICE_TYPES = ['BOARDING', 'PET_TAXI'];
    if (!serviceType || !VALID_SERVICE_TYPES.includes(serviceType)) {
      return NextResponse.json({ error: 'INVALID_SERVICE_TYPE' }, { status: 400 });
    }
    if (!petIds?.length || !startDate) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
    }

    // Clients cannot book in the past (admins can for data entry)
    if (session.user.role === 'CLIENT') {
      const start = new Date(startDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (start < today) {
        return NextResponse.json({ error: 'DATE_IN_PAST' }, { status: 400 });
      }
    }

    // Validation horaires Pet Taxi : pas le dimanche, uniquement 10h-17h
    if (serviceType === 'PET_TAXI') {
      const taxiDate = new Date(startDate);
      if (taxiDate.getDay() === 0) {
        return NextResponse.json({ error: 'SUNDAY_NOT_ALLOWED' }, { status: 400 });
      }
      // Vérifier l'heure (depuis startDate ou arrivalTime)
      let taxiHour: number | null = null;
      let taxiMinute = 0;
      if (body.arrivalTime && typeof body.arrivalTime === 'string') {
        const parts = body.arrivalTime.split(':').map(Number);
        taxiHour = parts[0] ?? null;
        taxiMinute = parts[1] ?? 0;
      } else {
        taxiHour = taxiDate.getHours();
        taxiMinute = taxiDate.getMinutes();
      }
      if (taxiHour !== null) {
        const totalMinutes = taxiHour * 60 + taxiMinute;
        if (totalMinutes < 10 * 60 || totalMinutes > 17 * 60) {
          return NextResponse.json({ error: 'INVALID_TIME_SLOT' }, { status: 400 });
        }
      }
    }

    // Validate boarding taxi addon dates/times (same rules as standalone Pet Taxi)
    if (serviceType === 'BOARDING') {
      const addonChecks = [
        { enabled: taxiGoEnabled, date: taxiGoDate, time: taxiGoTime },
        { enabled: taxiReturnEnabled, date: taxiReturnDate, time: taxiReturnTime },
      ];
      for (const addon of addonChecks) {
        if (!addon.enabled) continue;
        if (addon.date) {
          const d = new Date(addon.date + 'T12:00:00');
          if (d.getDay() === 0) {
            return NextResponse.json({ error: 'SUNDAY_NOT_ALLOWED' }, { status: 400 });
          }
        }
        if (addon.time && typeof addon.time === 'string') {
          const [h, m] = addon.time.split(':').map(Number);
          const total = (h ?? 0) * 60 + (m ?? 0);
          if (total < 10 * 60 || total > 17 * 60) {
            return NextResponse.json({ error: 'INVALID_TIME_SLOT' }, { status: 400 });
          }
        }
      }
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

    // Booking reference: first 8 chars of UUID, uppercase — consistent across all systems
    // (computed after booking.create below — placeholder until then)
    let bookingRef = '';

    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPERADMIN';
    const clientId = isAdmin ? body.clientId : session.user.id;
    if (!clientId) {
      return NextResponse.json({ error: 'MISSING_CLIENT_ID' }, { status: 400 });
    }

    const VALID_SOURCES = ['ONLINE', 'MANUAL'];
    const resolvedSource = source && VALID_SOURCES.includes(source)
      ? source
      : isAdmin ? 'MANUAL' : 'ONLINE';

    // ── Auto-compute totalPrice before inserting the booking ──────────────────
    // Prevents the "0" / "0.06" bug: if the client sends 0 (or nothing),
    // we calculate the correct total from service details + pricing settings.
    let resolvedTotalPrice: number = typeof totalPrice === 'number' && totalPrice > 0 ? totalPrice : 0;
    let resolvedPricePerNight = typeof pricePerNight === 'number' && pricePerNight > 0 ? pricePerNight : 0;

    const nights = endDate
      ? Math.max(0, Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    if (resolvedTotalPrice === 0) {
      try {
        const pricing = await getPricingSettings();
        const petsForCalc = await prisma.pet.findMany({
          where: { id: { in: petIds } },
          select: { id: true, name: true, species: true },
        });

        if (serviceType === 'BOARDING') {
          const groomingMap: Record<string, 'SMALL' | 'LARGE'> = {};
          if (includeGrooming && groomingSize) {
            petsForCalc.filter(p => p.species === 'DOG').forEach(dog => {
              groomingMap[dog.id] = groomingSize as 'SMALL' | 'LARGE';
            });
          }
          const breakdown = calculateBoardingBreakdown(
            nights,
            petsForCalc,
            includeGrooming ? groomingMap : undefined,
            taxiGoEnabled ?? false,
            taxiReturnEnabled ?? false,
            pricing,
          );
          resolvedTotalPrice = breakdown.total;

          // Also resolve pricePerNight if not set (used by extension calc)
          if (!resolvedPricePerNight) {
            const dogs = petsForCalc.filter(p => p.species === 'DOG');
            const cats = petsForCalc.filter(p => p.species === 'CAT');
            if (dogs.length === 1 && cats.length === 0) {
              resolvedPricePerNight = nights > pricing.long_stay_threshold
                ? pricing.boarding_dog_long_stay
                : pricing.boarding_dog_per_night;
            } else if (dogs.length > 1) {
              resolvedPricePerNight = pricing.boarding_dog_multi;
            } else if (cats.length > 0 && dogs.length === 0) {
              resolvedPricePerNight = pricing.boarding_cat_per_night;
            }
          }
        } else if (serviceType === 'PET_TAXI') {
          const breakdown = calculateTaxiPrice(taxiType ?? 'STANDARD', pricing);
          resolvedTotalPrice = breakdown.total;
        }

        // Add custom booking items to the total
        if (Array.isArray(bookingItems)) {
          for (const item of bookingItems) {
            const qty = typeof item.quantity === 'number' ? item.quantity : 0;
            const up = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
            resolvedTotalPrice += qty * up;
          }
        }
      } catch { /* fallback: keep 0 — better than crashing */ }
    }

    const booking = await prisma.booking.create({
      data: {
        clientId,
        serviceType,
        status: isAdmin ? 'CONFIRMED' : 'PENDING',
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        arrivalTime: arrivalTime || null,
        notes: notes?.trim() || null,
        totalPrice: resolvedTotalPrice,
        source: resolvedSource,
        bookingPets: {
          create: petIds.map((petId: string) => ({ petId })),
        },
      },
      include: {
        bookingPets: { include: { pet: true } },
        client: true,
      },
    });

    // Set booking reference using the actual ID (consistent across all systems)
    bookingRef = booking.id.slice(0, 8).toUpperCase();

    // Create service-specific details
    if (serviceType === 'BOARDING') {
      await prisma.boardingDetail.create({
        data: {
          bookingId: booking.id,
          includeGrooming: includeGrooming ?? false,
          groomingSize: groomingSize || null,
          groomingPrice: typeof groomingPrice === 'number' ? groomingPrice : 0,
          pricePerNight: resolvedPricePerNight,
          taxiGoEnabled: taxiGoEnabled ?? false,
          taxiGoDate: taxiGoDate || null,
          taxiGoTime: taxiGoTime || null,
          taxiGoAddress: taxiGoAddress || null,
          taxiReturnEnabled: taxiReturnEnabled ?? false,
          taxiReturnDate: taxiReturnDate || null,
          taxiReturnTime: taxiReturnTime || null,
          taxiReturnAddress: taxiReturnAddress || null,
          taxiAddonPrice: typeof taxiAddonPrice === 'number' ? taxiAddonPrice : 0,
        },
      });
    } else if (serviceType === 'PET_TAXI') {
      await prisma.taxiDetail.create({
        data: {
          bookingId: booking.id,
          taxiType: taxiType ?? 'STANDARD',
          price: resolvedTotalPrice > 0 ? resolvedTotalPrice : 150,
        },
      });
    }

    // Persist extra admin-defined billing lines
    if (isAdmin && Array.isArray(bookingItems) && bookingItems.length > 0) {
      const validItems = bookingItems.filter(
        (item: { description?: unknown; quantity?: unknown; unitPrice?: unknown }) =>
          typeof item.description === 'string' &&
          item.description.trim().length > 0 &&
          typeof item.quantity === 'number' &&
          item.quantity > 0 &&
          typeof item.unitPrice === 'number' &&
          item.unitPrice >= 0,
      );
      if (validItems.length > 0) {
        await prisma.bookingItem.createMany({
          data: validItems.map((item: { description: string; quantity: number; unitPrice: number }) => ({
            bookingId: booking.id,
            description: item.description.trim(),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        });
      }
    }

    // Send notifications and emails
    const petNames = booking.bookingPets.map((bp) => bp.pet.name).join(', ');
    const locale = booking.client.language ?? 'fr';

    await createBookingConfirmationNotification(
      booking.clientId,
      bookingRef,
      petNames
    );

    // Notify admins when a client (not admin) creates a booking
    if (!isAdmin) {
      notifyAdminsNewBooking(
        booking.client.name ?? booking.client.email,
        petNames,
        serviceType === 'BOARDING' ? 'pension' : 'taxi animalier',
        serviceType === 'BOARDING' ? 'boarding' : 'pet taxi',
        bookingRef,
        booking.id
      ).catch(() => {});
    }

    const serviceName = serviceType === 'BOARDING'
      ? (locale === 'fr' ? 'Pension' : 'Boarding')
      : (locale === 'fr' ? 'Taxi animalier' : 'Pet Taxi');

    const { subject, html } = getEmailTemplate('booking_confirmation', {
      clientName: booking.client.name,
      bookingRef,
      service: serviceName,
      petName: petNames,
    }, locale);

    sendEmail({ to: booking.client.email, subject, html }).catch(() => {});

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
