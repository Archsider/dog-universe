/**
 * Extension flows for admin booking PATCH route.
 *
 * Three operations are exposed:
 *  - `approveExtensionMerge`: merge a separate PENDING_EXTENSION booking back
 *    into the original (used by the legacy "second-booking" extension UX).
 *  - `applyExtension`: extend a booking's endDate in place (direct admin extend
 *    OR approval of a flag-based client extension request).
 *  - `rejectExtensionMerge`: delete a separate PENDING_EXTENSION booking and
 *    clear the flag on the original.
 *
 * All three throw `BookingError` on validation/state failures so the route
 * handler can map error codes to HTTP responses without leaking Prisma details.
 */
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { BookingError } from '../booking-errors';
import { checkBoardingCapacity, type CapacityCheckExceeded } from '@/lib/capacity';
import { logger } from '@/lib/logger';
import { ServiceType } from './constants';
import { notDeleted } from '@/lib/prisma-soft';
import { withSpan } from '@/lib/observability';

type BookingWithDetails = Awaited<ReturnType<typeof loadBookingWithDetails>>;

async function loadBookingWithDetails(bookingId: string) {
  return prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    include: {
      client: true,
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: true,
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// approveExtensionMerge — used when the extension lives as a separate booking
// ────────────────────────────────────────────────────────────────────────────

export interface ApproveExtensionMergeArgs {
  bookingId: string;
  actorId: string;
}

export async function approveExtensionMerge(args: ApproveExtensionMergeArgs) {
  return withSpan(
    'booking.admin.approveExtensionMerge',
    { bookingId: args.bookingId },
    () => approveExtensionMergeImpl(args),
  );
}

async function approveExtensionMergeImpl(args: ApproveExtensionMergeArgs) {
  const { bookingId, actorId } = args;

  const booking = await loadBookingWithDetails(bookingId);
  if (!booking) throw new BookingError('NOT_FOUND', { message: 'Booking not found', status: 404 });
  if (booking.status !== 'PENDING_EXTENSION') {
    throw new BookingError('INVALID_TRANSITION', { message: 'Booking not in PENDING_EXTENSION state' });
  }
  if (!booking.extensionForBookingId) {
    throw new BookingError('NO_ORIGINAL_BOOKING', { message: 'Extension booking is missing original link' });
  }

  const originalBooking = await prisma.booking.findFirst({
    where: notDeleted({ id: booking.extensionForBookingId }),
    include: { invoice: true, bookingPets: { include: { pet: true } }, boardingDetail: true, client: true },
  });

  if (!originalBooking) {
    throw new BookingError('ORIGINAL_BOOKING_NOT_FOUND', { message: 'Original booking not found', status: 404 });
  }

  const newEndDate = booking.endDate ?? booking.startDate;

  // Capacity is checked again INSIDE the transaction (line ~105) to close
  // the race between two admins approving overlapping extensions
  // concurrently.  This pre-check stays for fast 400 returns on obvious
  // overflow ; the in-tx check is the authoritative gate.
  const extCapacityPre = await checkBoardingCapacity({
    petIds: originalBooking.bookingPets.map(bp => bp.pet.id),
    startDate: originalBooking.endDate ?? originalBooking.startDate,
    endDate: newEndDate,
    excludeBookingId: originalBooking.id,
  });
  if (!extCapacityPre.ok) {
    throw new BookingError('CAPACITY_EXCEEDED', { message: 'Capacity exceeded', payload: extCapacityPre });
  }

  const { calculateBoardingTotalForExtension, getPricingSettings } = await import('@/lib/pricing');
  const pricingSettingsForExt = await getPricingSettings();
  const petsForExt = originalBooking.bookingPets.map(bp => bp.pet);
  const mergedNights = Math.floor(
    (newEndDate.getTime() - originalBooking.startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const groomingPriceForExt = Number(originalBooking.boardingDetail?.groomingPrice ?? 0);
  const taxiAddonPriceForExt = Number(originalBooking.boardingDetail?.taxiAddonPrice ?? 0);
  const newTotal = Math.round(
    calculateBoardingTotalForExtension(petsForExt, mergedNights, groomingPriceForExt, taxiAddonPriceForExt, pricingSettingsForExt) * 100
  ) / 100;

  if (newTotal <= 0) {
    throw new BookingError('INVALID_COMPUTED_TOTAL', { message: 'Invalid computed total' });
  }

  // Track which invoice ends up holding the merged stay so we can
  // re-allocate its payments + reconciles status/paidAmount/paidAt post-tx.
  // The PG trigger `trg_recompute_invoice_amount` handles `amount` on its
  // own from SUM(items.total) — never write `amount` manually here.
  let mergedInvoiceId: string | null = null;
  let extensionPaymentsToTransfer: { id: string }[] = [];

  await prisma.$transaction(async (tx) => {
    // Re-check capacity inside the tx to defeat the race between two
    // concurrent extension approvals : both see the pre-check pass, both
    // reach the tx, only the second one re-counts (with the tx isolation
    // semantics) and gets the canonical overflow.
    const extCapacityTx = await checkBoardingCapacity({
      petIds: originalBooking.bookingPets.map(bp => bp.pet.id),
      startDate: originalBooking.endDate ?? originalBooking.startDate,
      endDate: newEndDate,
      excludeBookingId: originalBooking.id,
    }, tx);
    if (!extCapacityTx.ok) {
      throw new BookingError('CAPACITY_EXCEEDED', { message: 'Capacity exceeded', payload: extCapacityTx });
    }

    await tx.stayPhoto.updateMany({ where: { bookingId }, data: { bookingId: originalBooking.id } });
    await tx.bookingItem.updateMany({ where: { bookingId }, data: { bookingId: originalBooking.id } });

    if (originalBooking.invoice && booking.invoice) {
      // MOVE items from the extension invoice into the original one.  This
      // gives a single coherent line set and lets the PG trigger compute
      // the canonical `amount`.  Then move payments + delete the now-empty
      // extension invoice.  No direct write of amount/paidAmount/status.
      await tx.invoiceItem.updateMany({
        where: { invoiceId: booking.invoice.id },
        data:  { invoiceId: originalBooking.invoice.id },
      });
      extensionPaymentsToTransfer = await tx.payment.findMany({
        where: { invoiceId: booking.invoice.id },
        select: { id: true },
      });
      if (extensionPaymentsToTransfer.length > 0) {
        await tx.payment.updateMany({
          where: { invoiceId: booking.invoice.id },
          data:  { invoiceId: originalBooking.invoice.id },
        });
      }
      await tx.invoice.delete({ where: { id: booking.invoice.id } });
      mergedInvoiceId = originalBooking.invoice.id;
    } else if (!originalBooking.invoice && booking.invoice) {
      // Re-parent the extension invoice to the original booking — items and
      // payments stay together.  Amount stays correct via the trigger.
      // eslint-disable-next-line dog-universe/no-direct-invoice-mutation -- OK: re-parent only, no money field touched.
      await tx.invoice.update({
        where: { id: booking.invoice.id },
        data:  { bookingId: originalBooking.id },
      });
      mergedInvoiceId = booking.invoice.id;
    } else if (originalBooking.invoice && !booking.invoice) {
      // No new invoice rows to merge — but the items on the original may
      // already cover the wrong nights count.  Leave the items as-is ;
      // allocatePayments below will at least recompute status against the
      // trigger-derived amount.  If the nights count needs a fresh line,
      // admin should re-issue from /admin/billing.
      mergedInvoiceId = originalBooking.invoice.id;
    }

    await tx.booking.update({
      where: { id: originalBooking.id },
      data: {
        endDate: newEndDate,
        totalPrice: newTotal,
        hasExtensionRequest: false,
        extensionRequestedEndDate: null,
        extensionRequestNote: null,
      },
    });

    // Soft-delete the extension shadow booking so audit trail survives.
    // Hard delete here was destroying BookingPet / BoardingDetail rows
    // permanently (cascade FK) — making any later report on this booking
    // id throw a 404.  Soft-delete keeps the row visible to admins via
    // the deletedAt filter override.
    await tx.booking.update({
      where: { id: bookingId },
      data: { deletedAt: new Date() },
    });
  });

  // Re-allocate payments on the merged invoice so paidAmount / status /
  // paidAt / item.allocatedAmount reflect the post-merge truth.  Opens
  // its own Serializable tx ; safe post-merge.
  if (mergedInvoiceId) {
    try {
      const { allocatePayments } = await import('@/lib/payments');
      await allocatePayments(mergedInvoiceId);
    } catch (err) {
      logger.error('extension-merge', 'reallocate_failed', {
        invoiceId: mergedInvoiceId,
        transferredPayments: extensionPaymentsToTransfer.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const bookingRef = originalBooking.id.slice(0, 8).toUpperCase();
  const newEndDateDisplay = newEndDate.toLocaleDateString(originalBooking.client?.language === 'en' ? 'en-GB' : 'fr-MA');
  const { createBookingExtendedNotification } = await import('@/lib/notifications');
  await createBookingExtendedNotification(originalBooking.clientId, bookingRef, newEndDateDisplay, originalBooking.client?.language ?? 'fr')
    .catch(err => logger.error('notification', 'Failed to create notification', { error: err instanceof Error ? err.message : String(err) }));

  await logAction({
    userId: actorId,
    action: 'EXTENSION_APPROVED',
    entityType: 'Booking',
    entityId: originalBooking.id,
    details: { extensionBookingId: bookingId, newEndDate: newEndDate.toISOString().slice(0, 10), newTotal },
  });

  return { message: 'extension_approved', originalBookingId: originalBooking.id, newTotal };
}

// ────────────────────────────────────────────────────────────────────────────
// rejectExtensionMerge — delete the separate PENDING_EXTENSION booking
// ────────────────────────────────────────────────────────────────────────────

export interface RejectExtensionMergeArgs {
  bookingId: string;
  actorId: string;
}

export async function rejectExtensionMerge(args: RejectExtensionMergeArgs) {
  return withSpan(
    'booking.admin.rejectExtensionMerge',
    { bookingId: args.bookingId },
    () => rejectExtensionMergeImpl(args),
  );
}

async function rejectExtensionMergeImpl(args: RejectExtensionMergeArgs) {
  const { bookingId, actorId } = args;
  const booking = await loadBookingWithDetails(bookingId);
  if (!booking) throw new BookingError('NOT_FOUND', { message: 'Booking not found', status: 404 });
  if (booking.status !== 'PENDING_EXTENSION') {
    throw new BookingError('INVALID_TRANSITION', { message: 'Booking not in PENDING_EXTENSION state' });
  }

  const originalBookingId = booking.extensionForBookingId;

  await prisma.$transaction(async (tx) => {
    if (booking.invoice) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: booking.invoice.id } });
      await tx.invoice.delete({ where: { id: booking.invoice.id } });
    }
    await tx.booking.delete({ where: { id: bookingId } });

    if (originalBookingId) {
      await tx.booking.update({
        where: { id: originalBookingId },
        data: { hasExtensionRequest: false, extensionRequestedEndDate: null, extensionRequestNote: null },
      });
    }
  });

  if (originalBookingId) {
    const bookingRef = originalBookingId.slice(0, 8).toUpperCase();
    const { createExtensionRejectedNotification } = await import('@/lib/notifications');
    await createExtensionRejectedNotification(booking.clientId, bookingRef)
      .catch(err => logger.error('notification', 'Failed to create notification', { error: err instanceof Error ? err.message : String(err) }));
  }

  await logAction({
    userId: actorId,
    action: 'EXTENSION_REJECTED',
    entityType: 'Booking',
    entityId: bookingId,
    details: { originalBookingId },
  });

  return { message: 'extension_rejected', originalBookingId };
}

// ────────────────────────────────────────────────────────────────────────────
// applyExtension — extend a booking in-place (direct admin or flag approval)
// ────────────────────────────────────────────────────────────────────────────

export interface ApplyExtensionArgs {
  booking: NonNullable<BookingWithDetails>;
  newEndDateStr: string;
  forcePaidInvoice: boolean;
  actorId: string;
  isApproval: boolean;
}

export async function applyExtension(args: ApplyExtensionArgs) {
  return withSpan(
    'booking.admin.applyExtension',
    {
      bookingId: args.booking.id,
      newEndDate: args.newEndDateStr,
      isApproval: args.isApproval,
      forcePaidInvoice: args.forcePaidInvoice,
    },
    () => applyExtensionImpl(args),
  );
}

async function applyExtensionImpl(args: ApplyExtensionArgs) {
  const { booking, newEndDateStr, forcePaidInvoice, actorId, isApproval } = args;

  if (booking.serviceType !== ServiceType.BOARDING) {
    throw new BookingError('ONLY_BOARDING', { message: 'Extensions only apply to boarding stays' });
  }

  if (booking.invoice?.status === 'PAID' && !forcePaidInvoice) {
    throw new BookingError('INVOICE_ALREADY_PAID', {
      message: 'Invoice already paid',
      status: 409,
      payload: { hint: 'Pass forcePaidInvoice:true to override' },
    });
  }

  const newEndDate = new Date(newEndDateStr + 'T12:00:00');
  if (isNaN(newEndDate.getTime())) {
    throw new BookingError('INVALID_FIELDS', { message: 'Invalid end date' });
  }
  if (newEndDate <= booking.startDate) {
    throw new BookingError('INVALID_FIELDS', { message: 'New end date must be after start date' });
  }
  if (booking.endDate && newEndDate <= booking.endDate) {
    throw new BookingError('INVALID_FIELDS', { message: 'New end date must be after current end date' });
  }

  const newNights = Math.floor((newEndDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24));
  const pets = booking.bookingPets.map(bp => bp.pet);
  const groomingPrice = Number(booking.boardingDetail?.groomingPrice ?? 0);
  const taxiAddonPrice = Number(booking.boardingDetail?.taxiAddonPrice ?? 0);

  const { calculateBoardingTotalForExtension, getPricingSettings } = await import('@/lib/pricing');
  const pricingSettings = await getPricingSettings();
  const newTotal = calculateBoardingTotalForExtension(pets, newNights, groomingPrice, taxiAddonPrice, pricingSettings);

  if (newTotal <= 0) {
    throw new BookingError('INVALID_COMPUTED_TOTAL', { message: 'Invalid computed total' });
  }

  let invoiceWarning = false;
  const txResult = await prisma.$transaction(async (tx): Promise<{ kind: 'ok' } | { kind: 'capacity_exceeded'; payload: CapacityCheckExceeded }> => {
    const extCapacity2 = await checkBoardingCapacity(
      {
        petIds: booking.bookingPets.map(bp => bp.pet.id),
        startDate: booking.endDate ?? booking.startDate,
        endDate: newEndDate,
        excludeBookingId: booking.id,
      },
      tx,
    );
    if (!extCapacity2.ok) {
      return { kind: 'capacity_exceeded', payload: extCapacity2 };
    }

    if (booking.invoice) {
      if (['PENDING', 'PARTIALLY_PAID', 'PAID'].includes(booking.invoice.status)) {
        const invoiceItems = await tx.invoiceItem.findMany({
          where: { invoiceId: booking.invoice.id },
          select: { id: true, description: true, unitPrice: true },
        });
        await Promise.all(
          invoiceItems
            .filter(item => {
              const d = item.description.toLowerCase();
              return (d.includes('pension') || d.includes('boarding')) && !d.includes('taxi') && Number(item.unitPrice) > 0;
            })
            .map(item => tx.invoiceItem.update({
              where: { id: item.id },
              data: { quantity: newNights, total: newNights * Number(item.unitPrice) },
            }))
        );

        const newPaidAmount = Number(booking.invoice.paidAmount);
        const newStatus = newPaidAmount >= newTotal ? 'PAID' : newPaidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';
        await tx.invoice.update({
          where: { id: booking.invoice.id },
          data: {
            amount: newTotal,
            status: newStatus,
            ...(newStatus !== 'PAID' && booking.invoice.status === 'PAID' ? { paidAt: null } : {}),
          },
        });
        if (booking.invoice.status === 'PAID' && newPaidAmount < newTotal) {
          invoiceWarning = true;
        }
      }
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        endDate: newEndDate,
        totalPrice: newTotal,
        hasExtensionRequest: false,
        extensionRequestedEndDate: null,
        extensionRequestNote: null,
        version: { increment: 1 },
      },
    });

    return { kind: 'ok' };
  }, { isolationLevel: 'Serializable' });

  if (txResult.kind === 'capacity_exceeded') {
    throw new BookingError('CAPACITY_EXCEEDED', { message: 'Capacity exceeded', payload: txResult.payload });
  }

  if (booking.invoice) {
    const { allocatePayments } = await import('@/lib/payments');
    await allocatePayments(booking.invoice.id);
  }

  const bookingRef = booking.id.slice(0, 8).toUpperCase();
  const newEndDateDisplay = newEndDate.toLocaleDateString(booking.client.language === 'en' ? 'en-GB' : 'fr-MA');
  const { createBookingExtendedNotification } = await import('@/lib/notifications');
  await createBookingExtendedNotification(booking.clientId, bookingRef, newEndDateDisplay, booking.client.language ?? 'fr')
    .catch(err => logger.error('notification', 'Failed to create notification', { error: err instanceof Error ? err.message : String(err) }));

  await logAction({
    userId: actorId,
    action: isApproval ? 'EXTENSION_APPROVED' : 'EXTENSION_DIRECT',
    entityType: 'Booking',
    entityId: booking.id,
    details: { newEndDate: newEndDateStr, newTotal, invoiceWarning },
  });

  return { message: 'extended', newEndDate: newEndDateStr, newTotal, invoiceWarning };
}
