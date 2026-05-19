/**
 * Pure service functions for admin booking mutations.
 *
 * Extracted from `src/app/api/admin/bookings/[id]/route.ts` PATCH handler.
 * These functions are HTTP-agnostic — they take typed input objects and either
 * return a typed result or throw `BookingError`. Side effects (audit logs,
 * payment reallocation, invoice sync) stay inside the service.
 *
 * NOTE: Only a subset of branches were extracted. Status-transition
 * notifications, editDates, and the extension flow remain inline in the route
 * handler because their behaviour is deeply coupled to Sentry spans, multiple
 * response shapes, and capacity error sentinels — extracting them carries a
 * regression risk that exceeds the benefit.
 */
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { BookingError } from './booking-errors';
import { taxiDescription } from '@/lib/invoice-descriptions';
import { notDeleted } from '@/lib/prisma-soft';
import { withSpan } from '@/lib/observability';
import { initialTaxiTripStatus, isTerminalInitialStatus } from '@/lib/taxi-trip-initial-status';

// ────────────────────────────────────────────────────────────────────────────
// patchBoardingDetail
// ────────────────────────────────────────────────────────────────────────────

const ALLOWED_BD_FIELDS = [
  'taxiReturnEnabled', 'taxiReturnDate', 'taxiReturnTime', 'taxiReturnAddress',
  'taxiGoEnabled', 'taxiGoDate', 'taxiGoTime', 'taxiGoAddress',
  'includeGrooming', 'groomingSize', 'groomingPrice', 'groomingStatus',
] as const;

export interface PatchBoardingDetailArgs {
  bookingId: string;
  patch: Record<string, unknown>;
  actorId: string;
}

/**
 * Apply a partial update to BoardingDetail and sync downstream entities:
 *  - Create/update outbound + return TaxiTrips (idempotent)
 *  - Sync linked invoice line items (taxi go/return + grooming per dog)
 *  - Reallocate payments
 */
export async function patchBoardingDetail(args: PatchBoardingDetailArgs) {
  return withSpan(
    'booking.admin.patchBoardingDetail',
    {
      bookingId: args.bookingId,
      patchKeys: Object.keys(args.patch).join(','),
    },
    () => patchBoardingDetailImpl(args),
  );
}

async function patchBoardingDetailImpl(args: PatchBoardingDetailArgs) {
  const { bookingId, patch, actorId } = args;

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    include: {
      bookingPets: { include: { pet: true } },
      invoice: true,
    },
  });
  if (!booking) throw new BookingError('NOT_FOUND');
  if (booking.serviceType !== 'BOARDING') {
    throw new BookingError('ONLY_BOARDING', {
      message: 'Only applies to BOARDING bookings',
    });
  }

  const invalidKeys = Object.keys(patch).filter(
    (k) => !ALLOWED_BD_FIELDS.includes(k as typeof ALLOWED_BD_FIELDS[number]),
  );
  if (invalidKeys.length > 0) {
    throw new BookingError('INVALID_FIELDS', {
      message: `Invalid fields: ${invalidKeys.join(', ')}`,
    });
  }

  // P0-8: wrap boardingDetail upsert + taxi trip creates/updates in a single
  // transaction so a partial failure (e.g. taxiStatusHistory create) cannot
  // leave boardingDetail updated but taxi trips missing.
  const bd = await prisma.$transaction(async (tx) => {
    await tx.boardingDetail.upsert({
      where: { bookingId },
      update: patch,
      create: { bookingId, ...patch },
    });

    const updatedBd = await tx.boardingDetail.findUnique({ where: { bookingId } });

    // Fetch both taxi trips inside the transaction for consistency.
    const [outboundTrip, returnTrip] = await Promise.all([
      tx.taxiTrip.findFirst({ where: { bookingId, tripType: 'OUTBOUND' } }),
      tx.taxiTrip.findFirst({ where: { bookingId, tripType: 'RETURN' } }),
    ]);

    // Si la réservation parente est déjà COMPLETED (cas typique : saisie
    // rétroactive walk-in où l'admin active l'addon taxi après-coup), on
    // crée le trip directement à son état terminal — c'est absurde de
    // partir d'un PLANNED pour un séjour qui s'est déjà terminé. Le
    // raccourci UI manuel (PR #169) reste en place pour les corrections
    // mid-stay et les cas où le booking devient COMPLETED après création
    // du trip.
    const outboundInitial = initialTaxiTripStatus(booking.status, 'OUTBOUND');
    const returnInitial = initialTaxiTripStatus(booking.status, 'RETURN');
    const isTerminal = isTerminalInitialStatus(booking.status);

    if (updatedBd?.taxiGoEnabled) {
      if (!outboundTrip) {
        const t = await tx.taxiTrip.create({
          data: {
            bookingId, tripType: 'OUTBOUND', status: outboundInitial,
            // Trip starts terminal ⇒ no live tracking, no token to issue.
            ...(isTerminal ? { trackingActive: false, trackingToken: null } : {}),
            date: updatedBd.taxiGoDate ?? undefined,
            time: updatedBd.taxiGoTime ?? undefined,
            address: updatedBd.taxiGoAddress ?? undefined,
          },
        });
        await tx.taxiStatusHistory.create({
          data: { taxiTripId: t.id, status: outboundInitial, updatedBy: actorId },
        });
      } else {
        await tx.taxiTrip.update({
          where: { id: outboundTrip.id },
          data: {
            date: updatedBd.taxiGoDate ?? undefined,
            time: updatedBd.taxiGoTime ?? undefined,
            address: updatedBd.taxiGoAddress ?? undefined,
          },
        });
      }
    }
    if (updatedBd?.taxiReturnEnabled) {
      if (!returnTrip) {
        const t = await tx.taxiTrip.create({
          data: {
            bookingId, tripType: 'RETURN', status: returnInitial,
            ...(isTerminal ? { trackingActive: false, trackingToken: null } : {}),
            date: updatedBd.taxiReturnDate ?? undefined,
            time: updatedBd.taxiReturnTime ?? undefined,
            address: updatedBd.taxiReturnAddress ?? undefined,
          },
        });
        await tx.taxiStatusHistory.create({
          data: { taxiTripId: t.id, status: returnInitial, updatedBy: actorId },
        });
      } else {
        await tx.taxiTrip.update({
          where: { id: returnTrip.id },
          data: {
            date: updatedBd.taxiReturnDate ?? undefined,
            time: updatedBd.taxiReturnTime ?? undefined,
            address: updatedBd.taxiReturnAddress ?? undefined,
          },
        });
      }
    }

    return updatedBd;
  });

  await logAction({
    userId: actorId,
    action: 'BOARDING_DETAIL_PATCHED',
    entityType: 'Booking',
    entityId: bookingId,
    details: { patch },
  });

  // Sync linked invoice line items so addon toggles reflect on billing.
  if (booking.invoice && booking.invoice.status !== 'CANCELLED' && bd) {
    const { getPricingSettings } = await import('@/lib/pricing');
    const pricing = await getPricingSettings();
    const taxiUnitPrice = pricing.taxi_standard ?? 0;

    const newTaxiAddonPrice =
      (bd.taxiGoEnabled ? taxiUnitPrice : 0) +
      (bd.taxiReturnEnabled ? taxiUnitPrice : 0);
    if (Number(bd.taxiAddonPrice) !== newTaxiAddonPrice) {
      await prisma.boardingDetail.update({
        where: { bookingId },
        data: { taxiAddonPrice: newTaxiAddonPrice },
      });
    }

    const dogs = booking.bookingPets
      .filter((bp) => bp.pet.species === 'DOG')
      .map((bp) => bp.pet);
    const invoiceId = booking.invoice.id;

    await prisma.$transaction(async (tx) => {
      const items = await tx.invoiceItem.findMany({
        where: { invoiceId },
        select: { id: true, description: true },
      });
      const findItem = (m: (d: string) => boolean) =>
        items.find((it) => m(it.description.toLowerCase()));

      const taxiGoItem = findItem((d) => d.includes('taxi') && d.includes('aller'));
      if (bd.taxiGoEnabled) {
        if (taxiGoItem) {
          await tx.invoiceItem.update({
            where: { id: taxiGoItem.id },
            data: { quantity: 1, unitPrice: taxiUnitPrice, total: taxiUnitPrice },
          });
        } else {
          await tx.invoiceItem.create({
            data: {
              invoiceId,
              description: taxiDescription('one-way', null, 1, taxiUnitPrice, 'fr'),
              quantity: 1, unitPrice: taxiUnitPrice, total: taxiUnitPrice,
              category: 'PET_TAXI',
            },
          });
        }
      } else if (taxiGoItem) {
        await tx.invoiceItem.delete({ where: { id: taxiGoItem.id } });
      }

      const taxiReturnItem = findItem((d) => d.includes('taxi') && d.includes('retour'));
      if (bd.taxiReturnEnabled) {
        if (taxiReturnItem) {
          await tx.invoiceItem.update({
            where: { id: taxiReturnItem.id },
            data: { quantity: 1, unitPrice: taxiUnitPrice, total: taxiUnitPrice },
          });
        } else {
          await tx.invoiceItem.create({
            data: {
              invoiceId,
              description: taxiDescription('return', null, 1, taxiUnitPrice, 'fr'),
              quantity: 1, unitPrice: taxiUnitPrice, total: taxiUnitPrice,
              category: 'PET_TAXI',
            },
          });
        }
      } else if (taxiReturnItem) {
        await tx.invoiceItem.delete({ where: { id: taxiReturnItem.id } });
      }

      const groomingItems = items.filter((it) => {
        const d = it.description.toLowerCase();
        return d.includes('toilettage') || d.includes('grooming');
      });
      for (const gi of groomingItems) {
        await tx.invoiceItem.delete({ where: { id: gi.id } });
      }
      if (bd.includeGrooming && bd.groomingSize && dogs.length > 0) {
        const rate = bd.groomingSize === 'SMALL'
          ? (pricing.grooming_small_dog ?? 0)
          : (pricing.grooming_large_dog ?? 0);
        const sizeLabel = bd.groomingSize === 'SMALL' ? 'petit' : 'grand';
        for (const dog of dogs) {
          await tx.invoiceItem.create({
            data: {
              invoiceId,
              description: `Toilettage ${dog.name} (${sizeLabel})`,
              quantity: 1, unitPrice: rate, total: rate,
              category: 'GROOMING',
            },
          });
        }
      }

      const after = await tx.invoiceItem.findMany({
        where: { invoiceId },
        select: { total: true },
      });
      const newAmount = after.reduce((s, it) => s + Number(it.total), 0);
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { amount: newAmount, version: { increment: 1 } },
      });
      await tx.booking.update({
        where: { id: bookingId },
        data: { totalPrice: newAmount, version: { increment: 1 } },
      });
    });

    const { allocatePayments } = await import('@/lib/payments');
    await allocatePayments(invoiceId);
  }

  return { message: 'boarding_detail_patched', boardingDetail: bd };
}

// ────────────────────────────────────────────────────────────────────────────
// addBookingItems
// ────────────────────────────────────────────────────────────────────────────

const VALID_ITEM_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER'] as const;
type ItemCategory = typeof VALID_ITEM_CATEGORIES[number];

export interface AddBookingItemsArgs {
  bookingId: string;
  rawItems: unknown[];
  actorId: string;
}

/**
 * Append BookingItem rows and, if a non-cancelled invoice is linked, mirror
 * them as InvoiceItems then recompute totals + reallocate payments.
 */
export async function addBookingItems(args: AddBookingItemsArgs) {
  return withSpan(
    'booking.admin.addItems',
    { bookingId: args.bookingId, itemCount: args.rawItems.length },
    () => addBookingItemsImpl(args),
  );
}

async function addBookingItemsImpl(args: AddBookingItemsArgs) {
  const { bookingId, rawItems, actorId } = args;

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    include: { invoice: true },
  });
  if (!booking) throw new BookingError('NOT_FOUND');

  interface ValidatedItem {
    description: string;
    quantity: number;
    unitPrice: number;
    category: ItemCategory;
  }

  const validated: ValidatedItem[] = [];
  for (const raw of rawItems) {
    if (typeof raw !== 'object' || raw === null) {
      throw new BookingError('INVALID_ITEM');
    }
    const it = raw as Record<string, unknown>;
    if (typeof it.description !== 'string' || !it.description.trim()) {
      throw new BookingError('INVALID_ITEM_DESCRIPTION');
    }
    if (typeof it.quantity !== 'number' || !Number.isInteger(it.quantity) || it.quantity <= 0 || it.quantity > 1_000) {
      throw new BookingError('INVALID_ITEM_QUANTITY');
    }
    if (typeof it.unitPrice !== 'number' || !isFinite(it.unitPrice) || it.unitPrice < 0 || it.unitPrice > 100_000) {
      throw new BookingError('INVALID_ITEM_PRICE');
    }
    // Defence-in-depth against quantity * unitPrice overflowing the
    // Decimal(10,2) line total: 1_000 * 100_000 = 100M but a single line is
    // capped at 1M MAD here so admins can spot fat-finger errors early.
    if (it.quantity * it.unitPrice > 1_000_000) {
      throw new BookingError('INVALID_ITEM_TOTAL');
    }
    if (
      it.category !== undefined &&
      (typeof it.category !== 'string' ||
        !VALID_ITEM_CATEGORIES.includes(it.category as ItemCategory))
    ) {
      throw new BookingError('INVALID_ITEM_CATEGORY');
    }
    validated.push({
      description: it.description.trim().slice(0, 200),
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      category: (it.category as ItemCategory | undefined) ?? 'OTHER',
    });
  }

  const invoice = booking.invoice;
  const syncInvoice = invoice && invoice.status !== 'CANCELLED';

  await prisma.$transaction(async (tx) => {
    await tx.bookingItem.createMany({
      data: validated.map((it) => ({
        bookingId,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.quantity * it.unitPrice,
        category: it.category ?? 'OTHER',
      })),
    });

    if (syncInvoice && invoice) {
      await tx.invoiceItem.createMany({
        data: validated.map((it) => ({
          invoiceId: invoice.id,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.quantity * it.unitPrice,
          category: it.category ?? 'OTHER',
        })),
      });

      const after = await tx.invoiceItem.findMany({
        where: { invoiceId: invoice.id },
        select: { total: true },
      });
      const newAmount = after.reduce((s, it) => s + Number(it.total), 0);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amount: newAmount, version: { increment: 1 } },
      });
      await tx.booking.update({
        where: { id: bookingId },
        data: { totalPrice: newAmount, version: { increment: 1 } },
      });
    }
  });

  if (syncInvoice && invoice) {
    const { allocatePayments } = await import('@/lib/payments');
    await allocatePayments(invoice.id);
  }

  await logAction({
    userId: actorId,
    action: 'BOOKING_ITEMS_ADDED',
    entityType: 'Booking',
    entityId: bookingId,
    details: {
      count: validated.length,
      invoiceSynced: !!syncInvoice,
      items: validated.map((it) => ({
        description: it.description,
        total: it.quantity * it.unitPrice,
        category: it.category,
      })),
    },
  });

  return {
    message: 'booking_items_added',
    count: validated.length,
    invoiceSynced: !!syncInvoice,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// rejectExtensionRequest (flag-based, NOT the PENDING_EXTENSION booking variant)
// ────────────────────────────────────────────────────────────────────────────

export interface RejectExtensionRequestArgs {
  bookingId: string;
  actorId: string;
}

/**
 * Reject a flag-based extension request (booking.hasExtensionRequest === true).
 * Clears the extension request fields and notifies the client.
 *
 * NOTE: The PENDING_EXTENSION variant (where the extension is its own booking)
 * remains inline in the route — different deletion semantics.
 */
export async function rejectExtensionRequest(args: RejectExtensionRequestArgs) {
  return withSpan(
    'booking.admin.rejectExtensionRequest',
    { bookingId: args.bookingId },
    () => rejectExtensionRequestImpl(args),
  );
}

async function rejectExtensionRequestImpl(args: RejectExtensionRequestArgs) {
  const { bookingId, actorId } = args;

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    select: { id: true, clientId: true, hasExtensionRequest: true, serviceType: true },
  });
  if (!booking) throw new BookingError('NOT_FOUND');
  if (booking.serviceType !== 'BOARDING') {
    throw new BookingError('ONLY_BOARDING', {
      message: 'Extensions only apply to boarding stays',
    });
  }
  if (!booking.hasExtensionRequest) {
    throw new BookingError('INVALID_TRANSITION', {
      message: 'No pending extension request',
    });
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      hasExtensionRequest: false,
      extensionRequestedEndDate: null,
      extensionRequestNote: null,
    },
  });

  const bookingRef = booking.id.slice(0, 8).toUpperCase();
  const { createExtensionRejectedNotification } = await import('@/lib/notifications');
  await createExtensionRejectedNotification(booking.clientId, bookingRef).catch(() => {});

  await logAction({
    userId: actorId,
    action: 'EXTENSION_REJECTED',
    entityType: 'Booking',
    entityId: bookingId,
    details: { bookingRef },
  });

  return { message: 'extension_rejected' };
}
