import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { checkBoardingCapacity, type CapacityCheckExceeded } from '@/lib/capacity';
import { log } from '@/lib/logger';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import {
  createBookingConfirmationNotification,
  notifyAdminsNewBooking,
  createBookingWaitlistedNotification,
} from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { sendAdminSMS, formatDateFR } from '@/lib/sms';
import { sendEmailNow, sendSmsNow } from '@/lib/notify-now';
import { getPricingSettings, calculateBoardingBreakdown, calculateTaxiPrice, calculateBoardingTotalForExtension } from '@/lib/pricing';
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
import { APP_URL } from '@/lib/config';

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

  // Idempotency-Key gate (optional header). If present, the same key cannot
  // create two bookings within 24h — defends against client retries and
  // double-clicks creating duplicate stays. Absent header = legacy behaviour.
  try {
    const idem = await tryAcquireIdempotency(request, 'bookings:create');
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
    // Validation de FORME via Zod (types, enums, longueurs) effectuée par withSchema.
    // Les règles métier (date passée, créneau taxi, ownership pets) restent
    // ci-dessous car elles dépendent du rôle et de la DB.
    const {
      serviceType,
      petIds,
      startDate,
      endDate,
      arrivalTime,
      notes,
      totalPrice,
      source,
      includeGrooming,
      groomingSize,
      groomingPrice,
      pricePerNight,
      taxiGoEnabled,
      taxiGoDate,
      taxiGoTime,
      taxiGoAddress,
      taxiReturnEnabled,
      taxiReturnDate,
      taxiReturnTime,
      taxiReturnAddress,
      taxiGoLat,
      taxiGoLng,
      taxiReturnLat,
      taxiReturnLng,
      taxiAddonPrice,
      taxiType,
      taxiPickupLat,
      taxiPickupLng,
      taxiPickupAddress,
      taxiDropoffLat,
      taxiDropoffLng,
      taxiDropoffAddress,
      bookingItems,
    } = body;

    // Clients cannot book in the past (admins can for data entry)
    if (session.user.role === 'CLIENT') {
      const start = new Date(startDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (start < today) {
        return NextResponse.json({ error: 'DATE_IN_PAST' }, { status: 400 });
      }
    }

    // Validation horaires Pet Taxi (standalone et addons pension)
    try {
      if (serviceType === 'PET_TAXI') {
        validateTaxiSlot({ startDate, arrivalTime: body.arrivalTime });
      } else if (serviceType === 'BOARDING') {
        validateBoardingTaxiAddons({
          taxiGoEnabled,
          taxiGoDate,
          taxiGoTime,
          taxiReturnEnabled,
          taxiReturnDate,
          taxiReturnTime,
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

    // Capacity is now enforced inside the booking creation transaction below
    // (Serializable isolation), eliminating the read-then-write race that
    // previously allowed concurrent requests to overshoot the limit.

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
    // CLIENT role: always recalculate server-side — the client-supplied
    // totalPrice is never trusted (price manipulation vector).
    // ADMIN role: accept provided value as-is (data-entry use case), fall back
    // to server calculation when 0 or absent.
    let resolvedTotalPrice: number = isAdmin && typeof totalPrice === 'number' && totalPrice > 0
      ? totalPrice
      : 0;
    let resolvedPricePerNight = typeof pricePerNight === 'number' && pricePerNight > 0 ? pricePerNight : 0;

    const nights = endDate
      ? Math.max(0, Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    if (resolvedTotalPrice === 0) {
      try {
        const pricing = await getPricingSettings();
        const petsForCalc = await prisma.pet.findMany({
          where: { id: { in: petIds }, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
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
      } catch (err) {
        await log('error', 'bookings', 'Pricing calculation failed', { error: String(err) });
        return NextResponse.json({ error: 'PRICE_CALCULATION_FAILED' }, { status: 500 });
      }
    }

    if (resolvedTotalPrice === 0) {
      return NextResponse.json({ error: 'PRICE_CALCULATION_FAILED', message: 'Booking price could not be determined. Please try again.' }, { status: 400 });
    }

    // ── Auto-merge: if this BOARDING booking is contiguous with an existing one ──
    // Detect when someone creates a booking whose startDate is the day after
    // an existing booking's endDate (same client, same pet(s)).
    // Instead of creating a duplicate, extend the existing booking.
    if (serviceType === 'BOARDING' && endDate) {
      const newStartMs = new Date(startDate).getTime();
      const dayBeforeMs = newStartMs - 24 * 60 * 60 * 1000;
      const dayBefore = new Date(dayBeforeMs);
      const dayBeforeStart = new Date(dayBefore);
      dayBeforeStart.setUTCHours(0, 0, 0, 0);
      const dayBeforeEnd = new Date(dayBefore);
      dayBeforeEnd.setUTCHours(23, 59, 59, 999);

      // Probe outside the tx purely as a fast-path: avoids opening a
      // Serializable transaction when no contiguous booking exists at all.
      // Inside the tx we re-read with the same predicate so the merge is safe
      // against concurrent updates to the row we touch.
      const probe = await prisma.booking.findFirst({
        where: {
          clientId,
          serviceType: 'BOARDING',
          status: { notIn: ['CANCELLED', 'REJECTED', 'COMPLETED'] },
          endDate: { gte: dayBeforeStart, lte: dayBeforeEnd },
          bookingPets: { some: { petId: { in: petIds } } },
          deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
        },
        select: { id: true },
      });

      if (probe) {
        // AUTO-MERGE under Serializable. We:
        //   1. Re-read the candidate inside the tx (snapshot consistency)
        //   2. Re-check capacity for the new window [oldEnd, newEnd], passing
        //      excludeBookingId so the candidate's own pets don't count
        //      against the limit during the merge
        //   3. Update invoice + booking atomically
        // Any concurrent capacity-consuming insert in the same window forces
        // PostgreSQL to abort one of the two transactions (P2034) — we retry
        // up to 3 times via runWithSerializableRetry.
        const pricingForMerge = await getPricingSettings();
        let mergeCapacityError: CapacityCheckExceeded | null = null;
        type MergeResult = {
          merged: NonNullable<Awaited<ReturnType<typeof prisma.booking.findFirst>>> & {
            invoice: Awaited<ReturnType<typeof prisma.invoice.findFirst>> | null;
            boardingDetail: Awaited<ReturnType<typeof prisma.boardingDetail.findFirst>> | null;
            bookingPets: Array<{ pet: { id: string; name: string; species: string } }>;
            client: { name: string | null; email: string };
          };
          mergedTotal: number;
          mergedEndDate: Date;
        } | null;

        let result: MergeResult = null;
        try {
          result = await runWithSerializableRetry(() =>
            prisma.$transaction(
              async (tx) => {
                const existingContiguous = await tx.booking.findFirst({
                  where: {
                    clientId,
                    serviceType: 'BOARDING',
                    status: { notIn: ['CANCELLED', 'REJECTED', 'COMPLETED'] },
                    endDate: { gte: dayBeforeStart, lte: dayBeforeEnd },
                    bookingPets: { some: { petId: { in: petIds } } },
                    deletedAt: null,
                  },
                  include: {
                    invoice: true,
                    boardingDetail: true,
                    bookingPets: { include: { pet: true } },
                    client: true,
                  },
                });
                if (!existingContiguous) return null;

                // Capacity recheck: only the *new* window (oldEnd → newEnd)
                // can push us over the limit. excludeBookingId omits this
                // booking's own pets from the overlap count for that window.
                const cap = await checkBoardingCapacity(
                  {
                    petIds,
                    startDate: existingContiguous.endDate ?? existingContiguous.startDate,
                    endDate: new Date(endDate),
                    excludeBookingId: existingContiguous.id,
                  },
                  tx,
                );
                if (!cap.ok) {
                  mergeCapacityError = cap;
                  return null;
                }

                const mergedEndDate = new Date(endDate);
                const mergedNights = Math.floor(
                  (mergedEndDate.getTime() - existingContiguous.startDate.getTime()) / (1000 * 60 * 60 * 24),
                );
                const mergePets = existingContiguous.bookingPets.map((bp) => bp.pet);
                const mergeGroomingPrice = Number(existingContiguous.boardingDetail?.groomingPrice ?? 0);
                const mergeTaxiAddonPrice = Number(existingContiguous.boardingDetail?.taxiAddonPrice ?? 0);
                const mergedTotal = calculateBoardingTotalForExtension(
                  mergePets,
                  mergedNights,
                  mergeGroomingPrice,
                  mergeTaxiAddonPrice,
                  pricingForMerge,
                );

                if (existingContiguous.invoice) {
                  if (existingContiguous.invoice.status === 'PENDING') {
                    await tx.invoice.update({
                      where: { id: existingContiguous.invoice.id },
                      data: { amount: mergedTotal },
                    });
                  } else if (existingContiguous.invoice.status === 'PARTIALLY_PAID') {
                    const invoiceUpdate: Record<string, unknown> = { amount: mergedTotal };
                    if (Number(existingContiguous.invoice.paidAmount) >= mergedTotal) {
                      invoiceUpdate.status = 'PAID';
                      invoiceUpdate.paidAt = existingContiguous.invoice.paidAt ?? new Date();
                    }
                    await tx.invoice.update({
                      where: { id: existingContiguous.invoice.id },
                      data: invoiceUpdate,
                    });
                  }
                  // If PAID: leave alone — admin handles supplementary invoice manually
                }

                await tx.booking.update({
                  where: { id: existingContiguous.id },
                  data: {
                    endDate: mergedEndDate,
                    totalPrice: mergedTotal,
                    hasExtensionRequest: false,
                    extensionRequestedEndDate: null,
                    extensionRequestNote: null,
                  },
                });

                return { merged: existingContiguous as never, mergedTotal, mergedEndDate };
              },
              { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
            ),
          );
        } catch (err) {
          if (err instanceof Error && err.message === 'CONFLICT_RETRY_EXCEEDED') {
            return NextResponse.json({ error: 'CONFLICT_RETRY_EXCEEDED' }, { status: 503 });
          }
          throw err;
        }

        if (mergeCapacityError) {
          const ce = mergeCapacityError as CapacityCheckExceeded;
          return NextResponse.json({ error: 'CAPACITY_EXCEEDED', ...ce }, { status: 400 });
        }

        if (result) {
          const { merged, mergedTotal, mergedEndDate } = result;
          const mergedRef = merged.id.slice(0, 8).toUpperCase();
          await logAction({
            userId: session.user.id,
            action: 'BOOKING_AUTO_MERGED',
            entityType: 'Booking',
            entityId: merged.id,
            details: {
              mergedEndDate: mergedEndDate.toISOString().slice(0, 10),
              mergedTotal,
              petIds,
            },
          });

          return NextResponse.json(
            { ...merged, bookingRef: mergedRef, autoMerged: true, newEndDate: endDate, newTotal: mergedTotal },
            { status: 200 },
          );
        }
        // result === null && no capacity error: candidate disappeared between
        // probe and tx (cancelled/deleted concurrently). Fall through to the
        // normal create path.
      }
    }
    // ── End auto-merge ────────────────────────────────────────────────────────────

    // ── Atomic capacity check + booking create ────────────────────────────────
    // Wraps capacity verification, booking insert, service-specific details,
    // and admin-defined extras into a single Serializable transaction.
    // Retries up to 3 times with linear backoff on P2034 (serialization
    // conflict — two concurrent transactions hit the same overlap window).
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

    // CLIENT path : si la pension est complète, basculer automatiquement en
    // WAITLIST plutôt que de retourner CAPACITY_EXCEEDED. ADMIN garde l'erreur
    // 400 explicite pour pouvoir réagir (proposer d'autres dates, contacter
    // un autre client en WAITLIST, etc.).
    const waitlistFallback = !isAdmin && serviceType === 'BOARDING';

    let booking: Awaited<ReturnType<typeof createBookingTx>>;
    try {
      booking = await Sentry.startSpan(
        { name: 'db.booking.create', op: 'db', attributes: { serviceType, petCount: petIds.length } },
        () => runWithSerializableRetry(() =>
          createBookingTx({
            clientId,
            serviceType,
            isAdmin,
            waitlistFallback,
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
        return NextResponse.json(
          { error: err.code, ...(err.payload ?? {}) },
          { status: err.status },
        );
      }
      if (err instanceof Error && err.message === 'CONFLICT_RETRY_EXCEEDED') {
        return NextResponse.json({ error: 'CONFLICT_RETRY_EXCEEDED' }, { status: 503 });
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2028' // Transaction API timeout
      ) {
        return NextResponse.json({ error: 'TRANSACTION_TIMEOUT' }, { status: 503 });
      }
      throw err;
    }

    // Set booking reference using the actual ID (consistent across all systems)
    bookingRef = booking.id.slice(0, 8).toUpperCase();

    // Send notifications and emails
    const petNames = booking.bookingPets.map((bp) => bp.pet.name).join(', ');
    const locale = booking.client.language ?? 'fr';

    // WAITLIST gets a different notification ("you're queued") instead of the
    // standard confirmation. The booking will receive the regular confirmation
    // pipeline if/when it gets promoted to PENDING by the waitlist watcher.
    if (booking.status === 'WAITLIST') {
      await createBookingWaitlistedNotification(
        booking.clientId,
        bookingRef,
        petNames,
      );
    } else {
      await createBookingConfirmationNotification(
        booking.clientId,
        bookingRef,
        petNames
      );
    }

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

      // SMS admin — nouvelle réservation (queued, with direct-send fallback)
      const clientLabel = booking.client.name ?? booking.client.email;
      const dateRangeSMS = booking.serviceType === 'BOARDING' && booking.endDate
        ? `du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
        : `le ${formatDateFR(booking.startDate)}`;
      sendSmsNow({ to: 'ADMIN', message: `🔔 Nouvelle réservation : ${clientLabel} pour ${petNames} ${dateRangeSMS}.` });

      // Email admin — loop tous les admins en DB (queued, with direct-send fallback)
      Sentry.startSpan(
        { name: 'booking.enqueueAdminEmails', op: 'queue' },
        async () => {
        try {
          const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
          const appUrl = APP_URL;
          const admins = await prisma.user.findMany({
            where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
            select: { email: true, language: true },
          });
          const serviceLabelFr = booking.serviceType === 'BOARDING' ? 'Pension' : 'Taxi animalier';
          const serviceLabelEn = booking.serviceType === 'BOARDING' ? 'Boarding' : 'Pet Taxi';
          const dateRangeHtml = booking.serviceType === 'BOARDING' && booking.endDate
            ? `du <strong>${formatDateFR(booking.startDate)}</strong> au <strong>${formatDateFR(booking.endDate)}</strong>`
            : `le <strong>${formatDateFR(booking.startDate)}</strong>`;
          const dateRangeHtmlEn = booking.serviceType === 'BOARDING' && booking.endDate
            ? `from <strong>${formatDateFR(booking.startDate)}</strong> to <strong>${formatDateFR(booking.endDate)}</strong>`
            : `on <strong>${formatDateFR(booking.startDate)}</strong>`;
          await Promise.all(admins.map((admin) => {
            const isFr = (admin.language ?? 'fr') === 'fr';
            const subject = isFr
              ? `🔔 Nouvelle réservation — ${clientLabel}`
              : `🔔 New booking — ${clientLabel}`;
            const html = isFr
              ? `<p>Bonjour,</p>
                 <p>Nouvelle demande de réservation (${esc(serviceLabelFr)}) :</p>
                 <ul>
                   <li>Client : <strong>${esc(clientLabel)}</strong></li>
                   <li>Animal(aux) : <strong>${esc(petNames)}</strong></li>
                   <li>Dates : ${dateRangeHtml}</li>
                   <li>Réf. : <code>${esc(bookingRef)}</code></li>
                 </ul>
                 <p><a href="${appUrl}/fr/admin/reservations/${booking.id}">Voir et valider la réservation</a></p>
                 <p>— Dog Universe CRM</p>`
              : `<p>Hello,</p>
                 <p>New booking request (${esc(serviceLabelEn)}):</p>
                 <ul>
                   <li>Client: <strong>${esc(clientLabel)}</strong></li>
                   <li>Pet(s): <strong>${esc(petNames)}</strong></li>
                   <li>Dates: ${dateRangeHtmlEn}</li>
                   <li>Ref.: <code>${esc(bookingRef)}</code></li>
                 </ul>
                 <p><a href="${appUrl}/en/admin/reservations/${booking.id}">Review and confirm</a></p>
                 <p>— Dog Universe CRM</p>`;
            sendEmailNow({ to: admin.email, subject, html });
            return Promise.resolve();
          }));
        } catch (err) {
          console.error(JSON.stringify({ level: 'error', service: 'booking', message: 'admin new booking notification loop failed', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
        }
        },
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

    sendEmailNow({ to: booking.client.email, subject, html });

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_CREATED,
      entityType: 'Booking',
      entityId: booking.id,
      details: { bookingRef, serviceType, totalPrice },
    });

    // New booking → admin pending count changes; bust the cache so admins
    // see the new request on their next layout render.
    revalidateTag('admin-counts');

    return NextResponse.json({ ...booking, bookingRef }, { status: 201 });
  } catch (error) {
    // Log enough context to diagnose without exposing internals to the client.
    console.error('[BOOKING CREATE ERROR]', JSON.stringify({
      message: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string })?.code,
      meta: (error as { meta?: unknown })?.meta,
    }));
    await log('error', 'booking', 'Create booking error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});
