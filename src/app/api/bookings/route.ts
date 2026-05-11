import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { log } from '@/lib/logger';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import {
  createBookingConfirmationNotification,
  notifyAdminsNewBooking,
  createBookingWaitlistedNotification,
} from '@/lib/notifications';
import { sendEmailNow } from '@/lib/notify-now';
import { getEmailTemplate } from '@/lib/email';
import { bookingCreateSchema } from '@/lib/validation';
import { withSchema } from '@/lib/with-schema';
import { tryAcquireIdempotency, IdempotencyKeyInvalidError } from '@/lib/idempotency';
import {
  createBookingTx,
  runWithSerializableRetry,
  validateTaxiSlot,
  validateBoardingTaxiAddons,
} from '@/lib/services/booking-client.service';
import { BookingError } from '@/lib/services/booking-errors';
import { decodeCursor, encodeCursor, parseLimit } from '@/lib/pagination';
import { revalidateTag } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { tryAutoMerge } from './_lib/auto-merge';
import { resolveBookingPrice } from './_lib/resolve-price';
import { notifyAdminsBookingCreated } from './_lib/notify-new-booking';
import { invalidateAvailabilityCache } from '@/lib/availability-cache';
import { getCasaStartOfDay } from '@/lib/timezone';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const clientId = searchParams.get('clientId');
  const limit = parseLimit(searchParams.get('limit'), 20);
  const boundedLimit = Math.min(limit, 100);
  const cursorRaw = searchParams.get('cursor');
  const decoded = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !decoded) {
    return NextResponse.json({ error: 'INVALID_CURSOR' }, { status: 400 });
  }

  const where: Record<string, unknown> = { deletedAt: null }; // soft-delete: required — no global extension (Edge Runtime incompatible)

  if (session.user.role === 'CLIENT') {
    where.clientId = session.user.id;
  } else if (clientId) {
    where.clientId = clientId;
  }

  const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED'];
  if (status && VALID_STATUSES.includes(status)) where.status = status;

  if (decoded) {
    where.AND = [
      {
        OR: [
          { createdAt: { lt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { lt: decoded.id } },
        ],
      },
    ];
  }

  const items = await prisma.booking.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, email: true } },
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: boundedLimit + 1,
  });

  const hasMore = items.length > boundedLimit;
  const data = hasMore ? items.slice(0, boundedLimit) : items;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return NextResponse.json({ data, nextCursor, hasMore });
}

export const POST = withSchema({ body: bookingCreateSchema }, async (request, { body }) => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Idempotency-Key gate (optional header).
  try {
    const idem = await tryAcquireIdempotency(request, 'bookings:create', session.user.id);
    if (!idem.acquired) {
      return NextResponse.json(
        { error: 'DUPLICATE_REQUEST', message: 'Idempotency-Key replay detected.' },
        { status: 409 },
      );
    }
  } catch (err) {
    if (err instanceof IdempotencyKeyInvalidError) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_INVALID' }, { status: 400 });
    }
    throw err;
  }

  try {
    const {
      serviceType, petIds, startDate, endDate, arrivalTime, notes, totalPrice, source,
      includeGrooming, groomingSize, groomingPrice, pricePerNight,
      taxiGoEnabled, taxiGoDate, taxiGoTime, taxiGoAddress,
      taxiReturnEnabled, taxiReturnDate, taxiReturnTime, taxiReturnAddress,
      taxiGoLat, taxiGoLng, taxiReturnLat, taxiReturnLng, taxiAddonPrice, taxiType,
      taxiPickupLat, taxiPickupLng, taxiPickupAddress,
      taxiDropoffLat, taxiDropoffLng, taxiDropoffAddress,
      bookingItems,
    } = body;

    // Clients cannot book in the past (admins can for data entry).
    // "Aujourd'hui" est borné à l'heure locale Casablanca — sans cette
    // conversion, le `setHours(0,0,0,0)` UTC du worker Vercel rejetterait
    // les réservations marocaines faites entre minuit et 1h locale.
    if (session.user.role === 'CLIENT') {
      const start = new Date(startDate);
      const today = getCasaStartOfDay();
      if (start < today) {
        return NextResponse.json({ error: 'DATE_IN_PAST' }, { status: 400 });
      }
    }

    // Validate Pet Taxi slot (standalone and boarding addons)
    try {
      if (serviceType === 'PET_TAXI') {
        validateTaxiSlot({ startDate, arrivalTime: body.arrivalTime });
      } else if (serviceType === 'BOARDING') {
        validateBoardingTaxiAddons({
          taxiGoEnabled, taxiGoDate, taxiGoTime,
          taxiReturnEnabled, taxiReturnDate, taxiReturnTime,
        });
      }
    } catch (err) {
      if (err instanceof BookingError) {
        return NextResponse.json({ error: err.code, ...(err.payload ?? {}) }, { status: err.status });
      }
      throw err;
    }

    // Verify pets belong to this client
    if (session.user.role === 'CLIENT') {
      const pets = await prisma.pet.findMany({
        where: { id: { in: petIds }, ownerId: session.user.id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      });
      if (pets.length !== petIds.length) {
        return NextResponse.json({ error: 'INVALID_PETS' }, { status: 400 });
      }
    }

    const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPERADMIN';
    const clientId = isAdmin ? body.clientId : session.user.id;
    if (!clientId) {
      return NextResponse.json({ error: 'MISSING_CLIENT_ID' }, { status: 400 });
    }

    const VALID_SOURCES = ['ONLINE', 'MANUAL'];
    const resolvedSource = source && VALID_SOURCES.includes(source)
      ? source
      : isAdmin ? 'MANUAL' : 'ONLINE';

    // Resolve pricing (delegates to _lib/resolve-price.ts)
    const priceResult = await resolveBookingPrice({
      serviceType,
      petIds,
      startDate,
      endDate,
      isAdmin,
      providedTotalPrice: typeof totalPrice === 'number' ? totalPrice : undefined,
      providedPricePerNight: typeof pricePerNight === 'number' ? pricePerNight : undefined,
      includeGrooming: includeGrooming ?? false,
      groomingSize: groomingSize || null,
      taxiGoEnabled: taxiGoEnabled ?? false,
      taxiReturnEnabled: taxiReturnEnabled ?? false,
      taxiType: taxiType ?? 'STANDARD',
      bookingItems: bookingItems ?? [],
    });

    if (priceResult.error) {
      return NextResponse.json({ error: 'PRICE_CALCULATION_FAILED' }, { status: 500 });
    }
    if (priceResult.resolvedTotalPrice === 0) {
      return NextResponse.json(
        { error: 'PRICE_CALCULATION_FAILED', message: 'Booking price could not be determined. Please try again.' },
        { status: 400 },
      );
    }

    const { resolvedTotalPrice, resolvedPricePerNight } = priceResult;

    // Auto-merge: extend an existing contiguous BOARDING booking instead of creating a new one
    if (serviceType === 'BOARDING' && endDate) {
      const mergeResult = await tryAutoMerge({ clientId, petIds, startDate, endDate, userId: session.user.id });
      if (mergeResult.merged) {
        return mergeResult.response;
      }
      if (mergeResult.capacityError) {
        return NextResponse.json({ error: 'CAPACITY_EXCEEDED', ...mergeResult.capacityError }, { status: 400 });
      }
      // capacityError === null && !merged → candidate disappeared; fall through to normal create
    }

    // Filter valid booking items (admin-only)
    const validBookingItems: { description: string; quantity: number; unitPrice: number }[] =
      isAdmin && Array.isArray(bookingItems)
        ? bookingItems.filter(
            (item: { description?: unknown; quantity?: unknown; unitPrice?: unknown }) =>
              typeof item.description === 'string' &&
              item.description.trim().length > 0 &&
              typeof item.quantity === 'number' &&
              item.quantity > 0 &&
              typeof item.unitPrice === 'number' &&
              item.unitPrice >= 0,
          )
        : [];

    // CLIENT: waitlist fallback when pension is full. ADMIN: explicit 400.
    const waitlistFallback = !isAdmin && serviceType === 'BOARDING';

    let booking: Awaited<ReturnType<typeof createBookingTx>>;
    try {
      booking = await Sentry.startSpan(
        { name: 'db.booking.create', op: 'db', attributes: { serviceType, petCount: petIds.length } },
        () => runWithSerializableRetry(() =>
          createBookingTx({
            clientId, serviceType, isAdmin, waitlistFallback,
            startDate: new Date(startDate),
            endDate: endDate ? new Date(endDate) : null,
            arrivalTime: arrivalTime || null,
            notes: notes?.trim() || null,
            totalPrice: resolvedTotalPrice,
            source: resolvedSource,
            petIds,
            idempotencyKey: [clientId, new Date(startDate).toISOString(), endDate ? new Date(endDate).toISOString() : '', ...([...petIds].sort())].join(':'),
            includeGrooming: includeGrooming ?? false,
            groomingSize: groomingSize || null,
            groomingPrice: typeof groomingPrice === 'number' ? groomingPrice : 0,
            pricePerNight: resolvedPricePerNight,
            taxiGoEnabled: taxiGoEnabled ?? false,
            taxiGoDate: taxiGoDate || null,
            taxiGoTime: taxiGoTime || null,
            taxiGoAddress: taxiGoAddress || null,
            taxiGoLat: typeof taxiGoLat === 'number' ? taxiGoLat : null,
            taxiGoLng: typeof taxiGoLng === 'number' ? taxiGoLng : null,
            taxiReturnEnabled: taxiReturnEnabled ?? false,
            taxiReturnDate: taxiReturnDate || null,
            taxiReturnTime: taxiReturnTime || null,
            taxiReturnAddress: taxiReturnAddress || null,
            taxiReturnLat: typeof taxiReturnLat === 'number' ? taxiReturnLat : null,
            taxiReturnLng: typeof taxiReturnLng === 'number' ? taxiReturnLng : null,
            taxiAddonPrice: typeof taxiAddonPrice === 'number' ? taxiAddonPrice : 0,
            taxiType: taxiType ?? 'STANDARD',
            taxiPickupLat: typeof taxiPickupLat === 'number' ? taxiPickupLat : null,
            taxiPickupLng: typeof taxiPickupLng === 'number' ? taxiPickupLng : null,
            taxiPickupAddress: taxiPickupAddress?.trim() || null,
            taxiDropoffLat: typeof taxiDropoffLat === 'number' ? taxiDropoffLat : null,
            taxiDropoffLng: typeof taxiDropoffLng === 'number' ? taxiDropoffLng : null,
            taxiDropoffAddress: taxiDropoffAddress?.trim() || null,
            bookingItems: validBookingItems,
          }),
        ),
      );
    } catch (err) {
      if (err instanceof BookingError) {
        return NextResponse.json({ error: err.code, ...(err.payload ?? {}) }, { status: err.status });
      }
      if (err instanceof Error && err.message === 'CONFLICT_RETRY_EXCEEDED') {
        return NextResponse.json({ error: 'CONFLICT_RETRY_EXCEEDED' }, { status: 503 });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2028') {
        return NextResponse.json({ error: 'TRANSACTION_TIMEOUT' }, { status: 503 });
      }
      throw err;
    }

    const bookingRef = booking.id.slice(0, 8).toUpperCase();
    const petNames = booking.bookingPets.map((bp) => bp.pet.name).join(', ');
    const locale = booking.client.language ?? 'fr';

    if (booking.status === 'WAITLIST') {
      await createBookingWaitlistedNotification(booking.clientId, bookingRef, petNames);
    } else {
      await createBookingConfirmationNotification(booking.clientId, bookingRef, petNames);
    }

    if (!isAdmin) {
      notifyAdminsNewBooking(
        booking.client.name ?? booking.client.email,
        petNames,
        serviceType === 'BOARDING' ? 'pension' : 'taxi animalier',
        serviceType === 'BOARDING' ? 'boarding' : 'pet taxi',
        bookingRef,
        booking.id
      ).catch(() => {});

      notifyAdminsBookingCreated({
        bookingId: booking.id,
        bookingRef,
        serviceType,
        clientLabel: booking.client.name ?? booking.client.email,
        petNames,
        startDate: booking.startDate,
        endDate: booking.endDate,
      });
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

    sendEmailNow({ to: booking.client.email, subject, html });

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_CREATED,
      entityType: 'Booking',
      entityId: booking.id,
      details: { bookingRef, serviceType, totalPrice },
    });

    revalidateTag('admin-counts');

    // Public availability cache must reflect the new occupancy on the next read.
    if (serviceType === 'BOARDING') {
      await invalidateAvailabilityCache(booking.startDate, booking.endDate);
    }

    return NextResponse.json({ ...booking, bookingRef }, { status: 201 });
  } catch (error) {
    await log('error', 'booking', 'Create booking error', {
      error: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string })?.code,
      meta: (error as { meta?: unknown })?.meta,
    });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});
