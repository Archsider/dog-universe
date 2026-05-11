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
import { log, logger } from '@/lib/logger';
import { taxiDescription } from '@/lib/invoice-descriptions';
import { getPensionPriceNumber, getPricingSettings } from '@/lib/pricing';
import { invalidateAvailabilityCache } from '@/lib/availability-cache';

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

  const where: Record<string, unknown> = { deletedAt: null }; // soft-delete: required — no global extension (Edge Runtime incompatible)
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

  // Slim select for list/Kanban view — heavier fields belong to the detail route
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
// (or a walk-in / "client de passage" with no portal access). Status is
// CONFIRMED on creation (admin is the approver). Reuses the same atomic
// createBookingTx as the client route — capacity is enforced inside the
// Serializable transaction.
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
    } = body;

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

    // ── Resolve clientId + petIds (walk-in path creates User + Pets first) ──
    let resolvedClientId: string;
    let resolvedPetIds: string[] = bodyPetIds ?? [];

    if (walkIn) {
      // Walk-in: create a transient client User. We use a real User row
      // (FK integrity required by Booking/Invoice), with a placeholder email
      // when none provided and a random unguessable bcrypt password — the
      // account can never be used to log in until the client triggers
      // password reset themselves. `isWalkIn=true` flags it as no-portal,
      // no-loyalty, no-notifications throughout the codebase.
      if ((walkInPets?.length ?? 0) === 0) {
        return NextResponse.json({ error: 'WALKIN_PETS_REQUIRED' }, { status: 400 });
      }
      const placeholderEmail = walkIn.email && walkIn.email.trim().length > 0
        ? walkIn.email.trim().toLowerCase()
        : `walkin-${crypto.randomBytes(8).toString('hex')}@dog-universe.local`;

      // Email collision guard — for explicit emails only (placeholders are
      // unique by construction).
      if (walkIn.email) {
        const existing = await prisma.user.findFirst({
          where: { email: placeholderEmail, deletedAt: null },
          select: { id: true },
        });
        if (existing) {
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
                // dateOfBirth is REQUIRED at the schema level (cf. validation.ts).
                // Branch retained defensively for legacy callers; new walk-ins must always send DOB.
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
    } else {
      if (!body.clientId) {
        return NextResponse.json({ error: 'MISSING_CLIENT_ID' }, { status: 400 });
      }
      resolvedClientId = body.clientId;

      if (resolvedPetIds.length === 0) {
        return NextResponse.json({ error: 'PETS_REQUIRED' }, { status: 400 });
      }
      // Verify client + ownership of pets
      const [client, pets] = await Promise.all([
        prisma.user.findFirst({
          where: { id: resolvedClientId, role: 'CLIENT', deletedAt: null },
          select: { id: true },
        }),
        prisma.pet.findMany({
          where: { id: { in: resolvedPetIds }, ownerId: resolvedClientId, deletedAt: null },
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

    // ── Atomic booking creation (capacity-checked under Serializable) ──
    // Compute pricePerNight from totalPrice / petCount / nights so that
    // BoardingDetail.pricePerNight reflects the actual unit price, used by
    // /admin/reservations/[id] to display the provisional total ("Nuits ×
    // pricePerNight × petCount"). For PET_TAXI or open-ended without endDate,
    // there are no nights, so pricePerNight stays 0.
    const computedPricePerNight = (() => {
      if (serviceType !== 'BOARDING' || !endDate || isOpenEnded) return 0;
      const nights = Math.round(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
      );
      const petCount = resolvedPetIds.length;
      if (nights <= 0 || petCount <= 0) return 0;
      return Math.round((totalPrice / petCount / nights) * 100) / 100;
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
          totalPrice,
          source: 'MANUAL',
          petIds: resolvedPetIds,
          idempotencyKey: walkIn
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

    const bookingRef = booking.id.slice(0, 8).toUpperCase();

    // Auto-COMPLETED for historical entries: if endDate is in the past,
    // the admin is entering a stay that already happened.
    if (endDate && new Date(endDate) < new Date()) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'COMPLETED' },
      });
    }

    // ── Optionally create the matching Invoice (PENDING) ──
    let invoiceNumber: string | null = null;
    if (createInvoice && totalPrice > 0) {
      try {
        // Dedup guard: skip if an invoice already exists for this booking
        // (protects against double-submission races at the HTTP layer)
        const existingInvoice = await prisma.invoice.findFirst({
          where: { bookingId: booking.id },
          select: { invoiceNumber: true },
        });
        if (existingInvoice) {
          invoiceNumber = existingInvoice.invoiceNumber;
        } else {
        const year = new Date().getFullYear();
        for (let attempt = 0; attempt < 5; attempt++) {
          const count = await prisma.invoice.count();
          const candidate = `DU-${year}-${String(count + 1 + attempt).padStart(4, '0')}`;
          const exists = await prisma.invoice.findUnique({ where: { invoiceNumber: candidate } });
          if (!exists) { invoiceNumber = candidate; break; }
        }
        if (invoiceNumber) {
          // Build rich per-pet line items for boarding, or a single taxi line.
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
            // Une ligne InvoiceItem BOARDING par animal, tarif via getPensionPrice().
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
              description: taxiDescription('one-way', null, 1, totalPrice, 'fr'),
              quantity: 1,
              unitPrice: totalPrice,
              total: totalPrice,
              category: ItemCategory.PET_TAXI,
            });
          } else {
            // Fallback for boarding without endDate or pets
            invoiceItems.push({
              description: serviceType === 'BOARDING' ? 'Pension' : 'Taxi animalier',
              quantity: 1,
              unitPrice: totalPrice,
              total: totalPrice,
              category: serviceType === 'BOARDING' ? ItemCategory.BOARDING : ItemCategory.PET_TAXI,
            });
          }

          await prisma.invoice.create({
            data: {
              invoiceNumber,
              clientId: resolvedClientId,
              bookingId: booking.id,
              amount: totalPrice,
              status: 'PENDING',
              paidAmount: 0,
              serviceType,
              periodDate: new Date(startDate),
              items: { create: invoiceItems },
            },
          });
        }
        } // end else (no existing invoice)
      } catch (err) {
        await log('error', 'admin-booking', 'Invoice auto-create failed', {
          error: err instanceof Error ? err.message : String(err),
          bookingId: booking.id,
        });
        // Don't fail the booking — admin can create the invoice manually
      }
    }

    // ── Notification + audit log (skip notification for walk-in clients) ──
    const petNames = booking.bookingPets.map((bp) => bp.pet.name).join(', ');
    if (!walkIn) {
      await createBookingConfirmationNotification(
        resolvedClientId,
        bookingRef,
        petNames,
      ).catch(() => {});
    }

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_CREATED,
      entityType: 'Booking',
      entityId: booking.id,
      details: { bookingRef, serviceType, totalPrice, walkIn: !!walkIn, invoiceNumber },
    });

    revalidateTag('admin-counts');

    if (serviceType === 'BOARDING') {
      await invalidateAvailabilityCache(booking.startDate, booking.endDate);
    }

    return NextResponse.json(
      { booking: { ...booking, bookingRef }, invoiceNumber },
      { status: 201 },
    );
  } catch (error) {
    await log('error', 'admin-booking', 'Create admin booking error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
});
