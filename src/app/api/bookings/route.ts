import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import {
  createBookingConfirmationNotification,
  notifyAdminsNewBooking,
  createBookingWaitlistedNotification,
} from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { sendAdminSMS, formatDateFR } from '@/lib/sms';
import { enqueueEmail, enqueueSms } from '@/lib/queues/index';
import { getPricingSettings, calculateBoardingBreakdown, calculateTaxiPrice, calculateBoardingTotalForExtension } from '@/lib/pricing';
import { bookingCreateSchema, formatZodError } from '@/lib/validation';
import { checkBoardingCapacity, type CapacityCheckExceeded } from '@/lib/capacity';
import { tryAcquireIdempotency, IdempotencyKeyInvalidError } from '@/lib/idempotency';
import { revalidateTag } from 'next/cache';
import * as Sentry from '@sentry/nextjs';

// Sentinel error thrown inside the booking transaction when capacity is full.
// Caught by the POST handler to convert into a 400 response.
class CapacityExceededError extends Error {
  constructor(public readonly capacity: CapacityCheckExceeded) {
    super('CAPACITY_EXCEEDED');
    this.name = 'CapacityExceededError';
  }
}

// Wraps an interactive Prisma transaction with retry logic for P2034
// (PostgreSQL "could not serialize access due to concurrent update").
// Up to 3 attempts, linear backoff 50ms × attempt. After exhaustion, throws
// Error('CONFLICT_RETRY_EXCEEDED') for the handler to map to a 503.
async function runWithSerializableRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Non-conflict errors (CapacityExceededError, validation, etc.) bubble up
      // immediately so callers can treat them as final.
      const isConflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
      if (!isConflict) throw err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 50 * attempt));
      }
    }
  }
  console.error(JSON.stringify({ level: 'error', service: 'booking', message: 'serializable retry exhausted', error: lastErr instanceof Error ? lastErr.message : String(lastErr), timestamp: new Date().toISOString() }));
  throw new Error('CONFLICT_RETRY_EXCEEDED');
}

interface CreateBookingTxArgs {
  clientId: string;
  serviceType: 'BOARDING' | 'PET_TAXI';
  isAdmin: boolean;
  // When capacity is full and waitlistFallback === true, the booking is
  // created with status='WAITLIST' instead of throwing CAPACITY_EXCEEDED.
  // Used for client self-service (no error 400, just queue them up).
  // Admins keep the explicit error to surface the conflict.
  waitlistFallback: boolean;
  startDate: Date;
  endDate: Date | null;
  arrivalTime: string | null;
  notes: string | null;
  totalPrice: number;
  source: string;
  petIds: string[];
  // Boarding-specific
  includeGrooming: boolean;
  groomingSize: string | null;
  groomingPrice: number;
  pricePerNight: number;
  taxiGoEnabled: boolean;
  taxiGoDate: string | null;
  taxiGoTime: string | null;
  taxiGoAddress: string | null;
  taxiReturnEnabled: boolean;
  taxiReturnDate: string | null;
  taxiReturnTime: string | null;
  taxiReturnAddress: string | null;
  taxiAddonPrice: number;
  // Taxi standalone
  taxiType: string;
  // Admin-only billing extras
  bookingItems: { description: string; quantity: number; unitPrice: number }[];
}

// Atomic booking creation. Reads (capacity check) and writes (booking,
// service-specific detail, billing items) execute under Serializable isolation
// so PostgreSQL aborts (P2034) any concurrent transaction that would violate
// the capacity invariant.
async function createBookingTx(args: CreateBookingTxArgs) {
  return prisma.$transaction(
    async (tx) => {
      // Capacity check uses the same tx — its reads are part of the snapshot.
      // BOARDING only; PET_TAXI standalone has no overnight slot to consume.
      let waitlisted = false;
      if (args.serviceType === 'BOARDING') {
        const capacity = await checkBoardingCapacity(
          { petIds: args.petIds, startDate: args.startDate, endDate: args.endDate },
          tx,
        );
        if (!capacity.ok) {
          if (args.waitlistFallback) {
            waitlisted = true;
          } else {
            throw new CapacityExceededError(capacity);
          }
        }
      }

      // Status resolution:
      // - WAITLIST  → capacity was full and waitlistFallback === true
      // - CONFIRMED → admin-created booking (manual entry, capacity OK)
      // - PENDING   → client-created booking awaiting validation
      const resolvedStatus = waitlisted
        ? 'WAITLIST'
        : args.isAdmin
          ? 'CONFIRMED'
          : 'PENDING';

      const booking = await tx.booking.create({
        data: {
          clientId: args.clientId,
          serviceType: args.serviceType,
          status: resolvedStatus,
          startDate: args.startDate,
          endDate: args.endDate,
          arrivalTime: args.arrivalTime,
          notes: args.notes,
          totalPrice: args.totalPrice,
          source: args.source,
          bookingPets: { create: args.petIds.map((petId) => ({ petId })) },
        },
        include: {
          bookingPets: { include: { pet: true } },
          client: true,
        },
      });

      if (args.serviceType === 'BOARDING') {
        await tx.boardingDetail.create({
          data: {
            bookingId: booking.id,
            includeGrooming: args.includeGrooming,
            groomingSize: args.groomingSize,
            groomingPrice: args.groomingPrice,
            pricePerNight: args.pricePerNight,
            taxiGoEnabled: args.taxiGoEnabled,
            taxiGoDate: args.taxiGoDate,
            taxiGoTime: args.taxiGoTime,
            taxiGoAddress: args.taxiGoAddress,
            taxiReturnEnabled: args.taxiReturnEnabled,
            taxiReturnDate: args.taxiReturnDate,
            taxiReturnTime: args.taxiReturnTime,
            taxiReturnAddress: args.taxiReturnAddress,
            taxiAddonPrice: args.taxiAddonPrice,
          },
        });
      } else if (args.serviceType === 'PET_TAXI') {
        await tx.taxiDetail.create({
          data: {
            bookingId: booking.id,
            taxiType: args.taxiType,
            price: args.totalPrice > 0 ? args.totalPrice : 150,
          },
        });
      }

      if (args.bookingItems.length > 0) {
        await tx.bookingItem.createMany({
          data: args.bookingItems.map((item) => ({
            bookingId: booking.id,
            description: item.description.trim(),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        });
      }

      return booking;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
  );
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const clientId = searchParams.get('clientId');

  // Pagination — defaults to first 50 results; clients can request up to 50 per page.
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));

  const where: Record<string, unknown> = { deletedAt: null }; // soft-delete: required — no global extension (Edge Runtime incompatible)

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
    take: limit,
    skip: (page - 1) * limit,
  });

  return NextResponse.json(bookings);
}

export async function POST(request: Request) {
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
    // Validation de FORME via Zod (types, enums, longueurs).
    // Les règles métier (date passée, créneau taxi, ownership pets) restent
    // ci-dessous car elles dépendent du rôle et de la DB.
    const parsed = bookingCreateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(formatZodError(parsed.error), { status: 400 });
    }
    const body = parsed.data;
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
      taxiAddonPrice,
      taxiType,
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
        if (isNaN(taxiHour) || isNaN(taxiMinute)) {
          return NextResponse.json({ error: 'INVALID_TIME_SLOT' }, { status: 400 });
        }
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

      const existingContiguous = await prisma.booking.findFirst({
        where: {
          clientId,
          serviceType: 'BOARDING',
          status: { notIn: ['CANCELLED', 'REJECTED', 'COMPLETED'] },
          endDate: { gte: dayBeforeStart, lte: dayBeforeEnd },
          bookingPets: { some: { petId: { in: petIds } } },
          deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
        },
        include: {
          invoice: true,
          boardingDetail: true,
          bookingPets: { include: { pet: true } },
          client: true,
        },
      });

      if (existingContiguous) {
        // AUTO-MERGE: extend the existing booking instead of creating a new one
        const mergedEndDate = new Date(endDate);
        const mergedNights = Math.floor(
          (mergedEndDate.getTime() - existingContiguous.startDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const mergePets = existingContiguous.bookingPets.map(bp => bp.pet);
        const mergeGroomingPrice = existingContiguous.boardingDetail?.groomingPrice ?? 0;
        const mergeTaxiAddonPrice = existingContiguous.boardingDetail?.taxiAddonPrice ?? 0;
        const mergedTotal = calculateBoardingTotalForExtension(
          mergePets,
          mergedNights,
          mergeGroomingPrice,
          mergeTaxiAddonPrice,
          await getPricingSettings(),
        );

        // Handle invoice update (same logic as extension)
        if (existingContiguous.invoice) {
          if (existingContiguous.invoice.status === 'PENDING') {
            await prisma.invoice.update({
              where: { id: existingContiguous.invoice.id },
              data: { amount: mergedTotal },
            });
          } else if (existingContiguous.invoice.status === 'PARTIALLY_PAID') {
            const invoiceUpdate: Record<string, unknown> = { amount: mergedTotal };
            if (existingContiguous.invoice.paidAmount >= mergedTotal) {
              invoiceUpdate.status = 'PAID';
              invoiceUpdate.paidAt = existingContiguous.invoice.paidAt ?? new Date();
            }
            await prisma.invoice.update({
              where: { id: existingContiguous.invoice.id },
              data: invoiceUpdate,
            });
          }
          // If PAID: don't touch — admin will handle supplementary invoice manually
        }

        await prisma.booking.update({
          where: { id: existingContiguous.id },
          data: {
            endDate: mergedEndDate,
            totalPrice: mergedTotal,
            hasExtensionRequest: false,
            extensionRequestedEndDate: null,
            extensionRequestNote: null,
          },
        });

        const mergedRef = existingContiguous.id.slice(0, 8).toUpperCase();
        await logAction({
          userId: session.user.id,
          action: 'BOOKING_AUTO_MERGED',
          entityType: 'Booking',
          entityId: existingContiguous.id,
          details: {
            mergedEndDate: mergedEndDate.toISOString().slice(0, 10),
            mergedTotal,
            petIds,
          },
        });

        return NextResponse.json(
          { ...existingContiguous, bookingRef: mergedRef, autoMerged: true, newEndDate: endDate, newTotal: mergedTotal },
          { status: 200 },
        );
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
        { name: 'booking.create', op: 'db' },
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
            taxiType: taxiType ?? 'STANDARD',
            bookingItems: validBookingItems,
          }),
        ),
      );
    } catch (err) {
      if (err instanceof CapacityExceededError) {
        return NextResponse.json(
          {
            error: 'CAPACITY_EXCEEDED',
            species: err.capacity.species,
            available: err.capacity.available,
            requested: err.capacity.requested,
            limit: err.capacity.limit,
          },
          { status: 400 },
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
      Sentry.startSpan(
        { name: 'booking.enqueueAdminSms', op: 'queue' },
        () => enqueueSms(
          { to: 'ADMIN', message: `🔔 Nouvelle réservation : ${clientLabel} pour ${petNames} ${dateRangeSMS}.` },
          `${booking.id}:admin-new-booking-sms`,
        ),
      ).catch(() => {});

      // Email admin — loop tous les admins en DB (queued, with direct-send fallback)
      Sentry.startSpan(
        { name: 'booking.enqueueAdminEmails', op: 'queue' },
        async () => {
        try {
          const esc = (s: string) => s
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
          const admins = await prisma.user.findMany({
            where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
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
          await Promise.all(admins.map((admin, idx) => {
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
            return enqueueEmail(
              { to: admin.email, subject, html },
              `${booking.id}:admin-new-booking-email-${idx}`,
            ).catch(err => console.error(JSON.stringify({ level: 'error', service: 'booking', message: 'admin new booking enqueue failed', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() })));
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

    Sentry.startSpan(
      { name: 'booking.enqueueNotifications', op: 'queue' },
      () => enqueueEmail({ to: booking.client.email, subject, html }, `${booking.id}:booking-confirmation-email`),
    ).catch(() => {});

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
    console.error(JSON.stringify({ level: 'error', service: 'booking', message: 'Create booking error', error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
