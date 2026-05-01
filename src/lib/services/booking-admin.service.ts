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
  const { bookingId, patch, actorId } = args;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
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

  await prisma.boardingDetail.upsert({
    where: { bookingId },
    update: patch,
    create: { bookingId, ...patch },
  });

  await logAction({
    userId: actorId,
    action: 'BOARDING_DETAIL_PATCHED',
    entityType: 'Booking',
    entityId: bookingId,
    details: { patch },
  });

  const bd = await prisma.boardingDetail.findUnique({ where: { bookingId } });

  // Fetch both taxi trips in parallel.
  const [outboundTrip, returnTrip] = await Promise.all([
    prisma.taxiTrip.findFirst({ where: { bookingId, tripType: 'OUTBOUND' } }),
    prisma.taxiTrip.findFirst({ where: { bookingId, tripType: 'RETURN' } }),
  ]);

  if (bd?.taxiGoEnabled) {
    if (!outboundTrip) {
      const t = await prisma.taxiTrip.create({
        data: {
          bookingId, tripType: 'OUTBOUND', status: 'PLANNED',
          date: bd.taxiGoDate ?? undefined,
          time: bd.taxiGoTime ?? undefined,
          address: bd.taxiGoAddress ?? undefined,
        },
      });
      await prisma.taxiStatusHistory.create({
        data: { taxiTripId: t.id, status: 'PLANNED', updatedBy: actorId },
      });
    } else {
      await prisma.taxiTrip.update({
        where: { id: outboundTrip.id },
        data: {
          date: bd.taxiGoDate ?? undefined,
          time: bd.taxiGoTime ?? undefined,
          address: bd.taxiGoAddress ?? undefined,
        },
      });
    }
  }
  if (bd?.taxiReturnEnabled) {
    if (!returnTrip) {
      const t = await prisma.taxiTrip.create({
        data: {
          bookingId, tripType: 'RETURN', status: 'PLANNED',
          date: bd.taxiReturnDate ?? undefined,
          time: bd.taxiReturnTime ?? undefined,
          address: bd.taxiReturnAddress ?? undefined,
        },
      });
      await prisma.taxiStatusHistory.create({
        data: { taxiTripId: t.id, status: 'PLANNED', updatedBy: actorId },
      });
    } else {
      await prisma.taxiTrip.update({
        where: { id: returnTrip.id },
        data: {
          date: bd.taxiReturnDate ?? undefined,
          time: bd.taxiReturnTime ?? undefined,
          address: bd.taxiReturnAddress ?? undefined,
        },
      });
    }
  }

  // Sync linked invoice line items so addon toggles reflect on billing.
  if (booking.invoice && booking.invoice.status !== 'CANCELLED' && bd) {
    const { getPricingSettings } = await import('@/lib/pricing');
    const pricing = await getPricingSettings();
    const taxiUnitPrice = pricing.taxi_standard ?? 0;

    const newTaxiAddonPrice =
      (bd.taxiGoEnabled ? taxiUnitPrice : 0) +
      (bd.taxiReturnEnabled ? taxiUnitPrice : 0);
    if (bd.taxiAddonPrice !== newTaxiAddonPrice) {
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
              invoiceId, description: 'Pet Taxi — Aller',
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
              invoiceId, description: 'Pet Taxi — Retour',
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
      const newAmount = after.reduce((s, it) => s + it.total, 0);
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
  const { bookingId, rawItems, actorId } = args;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
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
    if (typeof it.quantity !== 'number' || !Number.isInteger(it.quantity) || it.quantity <= 0) {
      throw new BookingError('INVALID_ITEM_QUANTITY');
    }
    if (typeof it.unitPrice !== 'number' || !isFinite(it.unitPrice) || it.unitPrice < 0) {
      throw new BookingError('INVALID_ITEM_PRICE');
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
      const newAmount = after.reduce((s, it) => s + it.total, 0);
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
  const { bookingId, actorId } = args;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
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
