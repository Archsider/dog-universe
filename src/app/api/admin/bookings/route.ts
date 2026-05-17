import { NextRequest, NextResponse } from 'next/server';
import { Prisma, ItemCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { decodeCursor, encodeCursor, parseLimit } from '@/lib/pagination';
import { adminBookingCreateSchema } from '@/lib/validation';
import { withSchema } from '@/lib/with-schema';
import {
  createBookingTx,
  runWithSerializableRetry,
  validateTaxiSlot,
} from '@/lib/services/booking-client.service';
import { BookingError } from '@/lib/services/booking-errors';
import { createBookingConfirmationNotification } from '@/lib/notifications';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { revalidateTag } from 'next/cache';
import { log } from '@/lib/logger';
import { taxiDescription } from '@/lib/invoice-descriptions';
import { getPensionPriceNumber, getPricingSettings } from '@/lib/pricing';
import { invalidateAvailabilityCache } from '@/lib/availability-cache';
import { WALKIN_DEFAULT_WINDOW_DAYS } from '@/lib/capacity';
import { notDeleted } from '@/lib/prisma-soft';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const serviceType = searchParams.get('type');
  const limit = parseLimit(searchParams.get('limit'));
  const cursorRaw = searchParams.get('cursor');
  const decoded = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !decoded) {
    return NextResponse.json({ error: 'INVALID_CURSOR' }, { status: 400 });
  }

  const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED'];
  const VALID_SERVICE_TYPES = ['BOARDING', 'PET_TAXI'];

  const where: Record<string, unknown> = notDeleted();
  if (status && VALID_STATUSES.includes(status)) where.status = status;
  if (serviceType && VALID_SERVICE_TYPES.includes(serviceType)) where.serviceType = serviceType;

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
    select: {
      id: true,
      status: true,
      serviceType: true,
      startDate: true,
      endDate: true,
      arrivalTime: true,
      notes: true,
      totalPrice: true,
      version: true,
      createdAt: true,
      client: { select: { id: true, name: true, email: true, phone: true } },
      bookingPets: {
        select: {
          pet: { select: { id: true, name: true, species: true, photoUrl: true } },
        },
      },
      invoice: { select: { id: true, invoiceNumber: true, status: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return NextResponse.json({ data, nextCursor, hasMore });
}

// POST /api/admin/bookings — admin creates a booking on behalf of a client
// (or a walk-in / "client de passage" with no portal access). Supports:
//   - initialStatus: PENDING | CONFIRMED | IN_PROGRESS (default) | COMPLETED
//   - isOpenEnded: true → no endDate, closed via CloseStayDialog
//   - finalAmount: required when initialStatus=COMPLETED → creates PAID invoice
export const POST = withSchema({ body: adminBookingCreateSchema }, async (request, { body }) => {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const {
      walkIn,
      pets: walkInPets,
      petIds: bodyPetIds,
      serviceType,
      startDate,
      endDate,
      arrivalTime,
      totalPrice,
      notes,
      createInvoice,
      isOpenEnded,
      initialStatus,
      finalAmount,
    } = body;

    // ── Basic structural validations ──────────────────────────────────────
    if (serviceType === 'BOARDING' && !endDate && !isOpenEnded) {
      return NextResponse.json({ error: 'END_DATE_REQUIRED' }, { status: 400 });
    }

    // Pet Taxi: validate Sunday + time window (10h-17h)
    if (serviceType === 'PET_TAXI') {
      try {
        validateTaxiSlot({ startDate, arrivalTime: arrivalTime ?? null });
      } catch (err) {
        if (err instanceof BookingError) {
          return NextResponse.json({ error: err.code, ...(err.payload ?? {}) }, { status: err.status });
        }
        throw err;
      }
    }

    // Walk-in specific: taxi aller cannot be combined with IN_PROGRESS
    // (if the driver is going to pick up the dog, the dog isn't in the
    // pension yet — the admin should set CONFIRMED instead).
    // Note: taxi addon detection via bookingItems is not available at this
    // level; the form validates this client-side and sends initialStatus correctly.
    // As a safety net: if service=PET_TAXI and initialStatus=IN_PROGRESS and walkIn,
    // the taxi is the main service — not a boarding addon, so no mismatch.

    // ── Resolve clientId + petIds ────────────────────────────────────────
    let resolvedClientId: string;
    let resolvedPetIds: string[] = bodyPetIds ?? [];
    // isWalkInClient = the user was created on-the-fly (no portal access).
    // isWalkInBooking = broader flag stored on Booking.isWalkIn:
    //   true whenever any "admin-managed / flexible" trait applies —
    //   open-ended stay, retroactive COMPLETED, or on-the-fly client.
    const isWalkInClient = !!walkIn;
    const isWalkInBooking = isWalkInClient || !!isOpenEnded || initialStatus === 'COMPLETED';

    if (isWalkInClient) {
      if ((walkInPets?.length ?? 0) === 0) {
        return NextResponse.json({ error: 'WALKIN_PETS_REQUIRED' }, { status: 400 });
      }

      // Phone-based dedup: reuse an existing walk-in client with the same phone
      // to avoid creating duplicates when the same client returns.
      const phoneNormalized = walkIn.phone.trim();
      const existingByPhone = await prisma.user.findFirst({
        where: notDeleted({ phone: phoneNormalized, isWalkIn: true }),
        select: { id: true },
      });

      if (existingByPhone) {
        // Reuse existing walk-in client — append new pets to their profile
        resolvedClientId = existingByPhone.id;
        const newPets = await prisma.$transaction(async (tx) =>
          Promise.all(
            (walkInPets ?? []).map((p) =>
              tx.pet.create({
                data: {
                  ownerId: resolvedClientId,
                  name: p.name.trim(),
                  species: p.species,
                  breed: p.breed?.trim() || null,
                  dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
                },
                select: { id: true },
              }),
            ),
          ),
        );
        resolvedPetIds = newPets.map((p) => p.id);
      } else {
        // New walk-in client: generate placeholder email + unusable password
        const placeholderEmail = walkIn.email && walkIn.email.trim().length > 0
          ? walkIn.email.trim().toLowerCase()
          : `walkin-${crypto.randomBytes(8).toString('hex')}@dog-universe.local`;

        if (walkIn.email) {
          const emailTaken = await prisma.user.findFirst({
            where: notDeleted({ email: placeholderEmail }),
            select: { id: true },
          });
          if (emailTaken) {
            return NextResponse.json({ error: 'EMAIL_TAKEN' }, { status: 400 });
          }
        }

        const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        const walkInName = walkIn.name.trim();
        const walkInParts = walkInName.split(/\s+/);
        const walkInFirstName = walkInParts[0] || walkInName;
        const walkInLastName = walkInParts.slice(1).join(' ') || walkInFirstName;

        const created = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: placeholderEmail,
              firstName: walkInFirstName,
              lastName: walkInLastName,
              name: walkInName,
              phone: walkIn.phone.trim(),
              passwordHash,
              role: 'CLIENT',
              isWalkIn: true,
            },
            select: { id: true },
          });
          const pets = await Promise.all(
            (walkInPets ?? []).map((p) =>
              tx.pet.create({
                data: {
                  ownerId: user.id,
                  name: p.name.trim(),
                  species: p.species,
                  breed: p.breed?.trim() || null,
                  dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
                },
                select: { id: true },
              }),
            ),
          );
          return { userId: user.id, petIds: pets.map((p) => p.id) };
        });

        resolvedClientId = created.userId;
        resolvedPetIds = created.petIds;
      }
    } else {
      if (!body.clientId) {
        return NextResponse.json({ error: 'MISSING_CLIENT_ID' }, { status: 400 });
      }
      resolvedClientId = body.clientId;

      if (resolvedPetIds.length === 0) {
        return NextResponse.json({ error: 'PETS_REQUIRED' }, { status: 400 });
      }
      const [client, pets] = await Promise.all([
        prisma.user.findFirst({
          where: notDeleted({ id: resolvedClientId, role: 'CLIENT' }),
          select: { id: true },
        }),
        prisma.pet.findMany({
          where: notDeleted({ id: { in: resolvedPetIds }, ownerId: resolvedClientId }),
          select: { id: true },
        }),
      ]);
      if (!client) {
        return NextResponse.json({ error: 'CLIENT_NOT_FOUND' }, { status: 404 });
      }
      if (pets.length !== resolvedPetIds.length) {
        return NextResponse.json({ error: 'INVALID_PETS' }, { status: 400 });
      }
    }

    // ── Capacity: open-ended walk-ins checked against a 30-day window ──
    // Open-ended bookings are excluded from the normal overlap count
    // (isOpenEnded=false filter), so this is an advisory pre-check only.
    // If capacity is tight, the admin sees a warning but the booking proceeds.
    let capacityWarning: string | null = null;
    if (isOpenEnded && serviceType === 'BOARDING') {
      // Add fixed-day-as-ms to avoid Date.setDate() ±1h drift at Casa midnight.
      const windowEnd = new Date(new Date(startDate).getTime() + WALKIN_DEFAULT_WINDOW_DAYS * 86_400_000);
      const { checkBoardingCapacity } = await import('@/lib/capacity');
      const cap = await checkBoardingCapacity({
        petIds: resolvedPetIds,
        startDate: new Date(startDate),
        endDate: windowEnd,
      });
      if (!cap.ok) {
        capacityWarning = `CAPACITY_WARNING_${cap.species}`;
      }
    }

    // ── Atomic booking creation ──────────────────────────────────────────
    const computedPricePerNight = (() => {
      const amount = initialStatus === 'COMPLETED' ? (finalAmount ?? totalPrice) : totalPrice;
      if (serviceType !== 'BOARDING' || !endDate || isOpenEnded) return 0;
      const nights = Math.round(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
      );
      const petCount = resolvedPetIds.length;
      if (nights <= 0 || petCount <= 0) return 0;
      return Math.round((amount / petCount / nights) * 100) / 100;
    })();

    let booking: Awaited<ReturnType<typeof createBookingTx>>;
    try {
      booking = await runWithSerializableRetry(() =>
        createBookingTx({
          clientId: resolvedClientId,
          serviceType,
          isAdmin: true,
          waitlistFallback: false,
          startDate: new Date(startDate),
          endDate: isOpenEnded ? null : endDate ? new Date(endDate) : null,
          isOpenEnded: !!isOpenEnded,
          arrivalTime: arrivalTime ?? null,
          notes: notes?.trim() || null,
          totalPrice: initialStatus === 'COMPLETED' ? (finalAmount ?? totalPrice) : totalPrice,
          source: 'MANUAL',
          petIds: resolvedPetIds,
          idempotencyKey: isWalkInClient
            ? undefined
            : [resolvedClientId, new Date(startDate).toISOString(), endDate ? new Date(endDate).toISOString() : '', ...([...resolvedPetIds].sort())].join(':'),
          includeGrooming: false,
          groomingSize: null,
          groomingPrice: 0,
          pricePerNight: computedPricePerNight,
          taxiGoEnabled: false,
          taxiGoDate: null,
          taxiGoTime: null,
          taxiGoAddress: null,
          taxiReturnEnabled: false,
          taxiReturnDate: null,
          taxiReturnTime: null,
          taxiReturnAddress: null,
          taxiAddonPrice: 0,
          taxiType: 'STANDARD',
          bookingItems: [],
        }),
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

    // ── Apply initial status + isWalkIn flag ─────────────────────────────
    // createBookingTx always creates with CONFIRMED (isAdmin=true).
    // We patch to the admin-chosen initialStatus and flag the booking as walk-in.
    const bookingUpdateData: Record<string, unknown> = {};
    if (isWalkInBooking) bookingUpdateData.isWalkIn = true;
    if (initialStatus !== 'CONFIRMED') bookingUpdateData.status = initialStatus;

    if (Object.keys(bookingUpdateData).length > 0) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: bookingUpdateData,
      });
      // Sync local reference so the response reflects the real status
      if (initialStatus !== 'CONFIRMED') {
        (booking as { status: string }).status = initialStatus;
      }
    }

    const bookingRef = booking.id.slice(0, 8).toUpperCase();

    // ── Invoice creation ─────────────────────────────────────────────────
    // COMPLETED: create a PAID invoice immediately (retroactive saisie).
    // Otherwise: create a PENDING invoice if createInvoice=true.
    const effectiveAmount = initialStatus === 'COMPLETED' ? (finalAmount ?? totalPrice) : totalPrice;
    let invoiceNumber: string | null = null;

    if ((initialStatus === 'COMPLETED' && effectiveAmount > 0) || (createInvoice && effectiveAmount > 0)) {
      try {
        const existingInvoice = await prisma.invoice.findFirst({
          where: { bookingId: booking.id },
          select: { invoiceNumber: true },
        });
        if (existingInvoice) {
          invoiceNumber = existingInvoice.invoiceNumber;
        } else {
          const { casablancaYMD } = await import('@/lib/dates-casablanca');
          const year = casablancaYMD().year;
          for (let attempt = 0; attempt < 5; attempt++) {
            const count = await prisma.invoice.count();
            const candidate = `DU-${year}-${String(count + 1 + attempt).padStart(4, '0')}`;
            const exists = await prisma.invoice.findUnique({ where: { invoiceNumber: candidate } });
            if (!exists) { invoiceNumber = candidate; break; }
          }

          if (invoiceNumber) {
            const invoiceItems: {
              description: string;
              quantity: number;
              unitPrice: number;
              total: number;
              category: ItemCategory;
            }[] = [];

            if (serviceType === 'BOARDING' && booking.bookingPets.length > 0 && endDate) {
              const nights = Math.round(
                (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24),
              );
              const qty = nights > 0 ? nights : 1;
              const dogsCount = booking.bookingPets.filter((bp) => bp.pet.species === 'DOG').length;
              const pricingSettings = await getPricingSettings();
              for (const bp of booking.bookingPets) {
                const speciesLabel = bp.pet.species === 'CAT' ? 'chat' : 'chien';
                const unitPrice = getPensionPriceNumber(bp.pet, dogsCount, qty, pricingSettings);
                invoiceItems.push({
                  description: `Pension ${bp.pet.name} (${speciesLabel})`,
                  quantity: qty,
                  unitPrice,
                  total: Math.round(unitPrice * qty * 100) / 100,
                  category: ItemCategory.BOARDING,
                });
              }
            } else if (serviceType === 'PET_TAXI') {
              invoiceItems.push({
                description: taxiDescription('one-way', null, 1, effectiveAmount, 'fr'),
                quantity: 1,
                unitPrice: effectiveAmount,
                total: effectiveAmount,
                category: ItemCategory.PET_TAXI,
              });
            } else {
              invoiceItems.push({
                description: serviceType === 'BOARDING' ? 'Pension' : 'Taxi animalier',
                quantity: 1,
                unitPrice: effectiveAmount,
                total: effectiveAmount,
                category: serviceType === 'BOARDING' ? ItemCategory.BOARDING : ItemCategory.PET_TAXI,
              });
            }

            const invoiceStatus = initialStatus === 'COMPLETED' ? 'PAID' : 'PENDING';
            await prisma.invoice.create({
              data: {
                invoiceNumber,
                clientId: resolvedClientId,
                bookingId: booking.id,
                amount: effectiveAmount,
                status: invoiceStatus,
                paidAmount: initialStatus === 'COMPLETED' ? effectiveAmount : 0,
                serviceType,
                periodDate: new Date(startDate),
                items: { create: invoiceItems },
              },
            });
          }
        }
      } catch (err) {
        await log('error', 'admin-booking', 'Invoice auto-create failed', {
          error: err instanceof Error ? err.message : String(err),
          bookingId: booking.id,
        });
      }
    }

    // ── Notification + audit log ──────────────────────────────────────────
    const petNames = booking.bookingPets.map((bp) => bp.pet.name).join(', ');
    // Skip confirmation notification for walk-in clients (no portal access)
    // and for retroactive COMPLETED entries (already done, no need to notify).
    // Registered clients with open-ended stays still receive the notification.
    if (!isWalkInClient && initialStatus !== 'COMPLETED') {
      await createBookingConfirmationNotification(
        resolvedClientId,
        bookingRef,
        petNames,
      ).catch(() => {});
    }

    const actionLabel = initialStatus === 'COMPLETED'
      ? 'Walk-in rétroactif créé en COMPLETED'
      : isWalkInBooking
        ? `Walk-in créé directement en ${initialStatus}`
        : LOG_ACTIONS.BOOKING_CREATED;

    await logAction({
      userId: session.user.id,
      action: isWalkInBooking ? actionLabel : LOG_ACTIONS.BOOKING_CREATED,
      entityType: 'Booking',
      entityId: booking.id,
      details: {
        bookingRef,
        serviceType,
        totalPrice: effectiveAmount,
        walkIn: isWalkInBooking,
        initialStatus,
        isOpenEnded: !!isOpenEnded,
        invoiceNumber,
      },
    });

    revalidateTag('admin-counts');

    if (serviceType === 'BOARDING') {
      await invalidateAvailabilityCache(booking.startDate, booking.endDate);
    }

    return NextResponse.json(
      {
        booking: { ...booking, bookingRef, status: initialStatus },
        invoiceNumber,
        ...(capacityWarning ? { warning: capacityWarning } : {}),
      },
      { status: 201 },
    );
  } catch (error) {
    await log('error', 'admin-booking', 'Create admin booking error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});
