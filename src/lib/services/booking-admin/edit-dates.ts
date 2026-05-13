/**
 * editDates branch of admin booking PATCH route.
 *
 * Admin corrects start/end date and we regenerate the BOARDING price + sync
 * the linked invoice items. PET_TAXI bookings re-validate the slot rules
 * (Sunday-closed, 10h–17h) via the client-side validator. Capacity check and
 * write happen inside a Serializable transaction to avoid TOCTOU.
 */
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { BookingError } from '../booking-errors';
import { checkBoardingCapacity, type CapacityCheckExceeded } from '@/lib/capacity';
import { ServiceType } from './constants';
import { notDeleted } from '@/lib/prisma-soft';

type Booking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

async function loadBooking(bookingId: string) {
  return prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    include: {
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      invoice: true,
    },
  });
}

export interface EditDatesArgs {
  booking: Booking;
  newStartStr: string;
  newEndStr: string;
  forcePaidInvoice: boolean;
  actorId: string;
}

export async function editDates(args: EditDatesArgs) {
  const { booking, newStartStr, newEndStr, forcePaidInvoice, actorId } = args;

  if (!newStartStr || !newEndStr) {
    throw new BookingError('INVALID_FIELDS', { message: 'editDates requires startDate and endDate' });
  }

  if (booking.invoice?.status === 'PAID' && !forcePaidInvoice) {
    throw new BookingError('INVOICE_ALREADY_PAID', {
      message: 'Invoice already paid',
      status: 409,
      payload: { hint: 'Pass forcePaidInvoice:true to override' },
    });
  }

  const newStart = new Date(newStartStr + 'T12:00:00Z');
  const newEnd = new Date(newEndStr + 'T12:00:00Z');

  if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
    throw new BookingError('INVALID_FIELDS', { message: 'Invalid dates' });
  }
  if (newEnd <= newStart) {
    throw new BookingError('INVALID_FIELDS', { message: 'endDate must be after startDate' });
  }

  const newNights = Math.floor((newEnd.getTime() - newStart.getTime()) / (1000 * 60 * 60 * 24));

  let newTotal = Number(booking.totalPrice);
  if (booking.serviceType === ServiceType.BOARDING) {
    const { calculateBoardingTotalForExtension, getPricingSettings } = await import('@/lib/pricing');
    const pricingSettings = await getPricingSettings();
    const pets = booking.bookingPets.map(bp => bp.pet);
    const groomingPrice = Number(booking.boardingDetail?.groomingPrice ?? 0);
    const taxiAddonPrice = Number(booking.boardingDetail?.taxiAddonPrice ?? 0);
    newTotal = calculateBoardingTotalForExtension(pets, newNights, groomingPrice, taxiAddonPrice, pricingSettings);
  }

  if (newTotal <= 0) {
    throw new BookingError('INVALID_COMPUTED_TOTAL', { message: 'Invalid computed total' });
  }

  // Reordered (was before pricing): the BOARDING capacity check inside the
  // transaction below is the canonical authoritative rejection (matches the
  // create-booking path's order). validateTaxiSlot only applies to PET_TAXI
  // and is mutually exclusive with the capacity branch, so this ordering is
  // purely about source-level consistency with the create path.
  if (booking.serviceType === ServiceType.PET_TAXI) {
    const { validateTaxiSlot } = await import('../booking-client.service');
    validateTaxiSlot({ startDate: newStart, arrivalTime: booking.arrivalTime });
  }

  const oldStartDate = booking.startDate.toISOString().slice(0, 10);
  const oldEndDate = booking.endDate?.toISOString().slice(0, 10) ?? null;

  const editTxResult = await prisma.$transaction(
    async (tx): Promise<{ kind: 'ok' } | { kind: 'capacity_exceeded'; payload: CapacityCheckExceeded }> => {
      if (booking.serviceType === ServiceType.BOARDING) {
        const capResult = await checkBoardingCapacity(
          {
            petIds: booking.bookingPets.map(bp => bp.pet.id),
            startDate: newStart,
            endDate: newEnd,
            excludeBookingId: booking.id,
          },
          tx,
        );
        if (!capResult.ok) {
          return { kind: 'capacity_exceeded', payload: capResult };
        }
      }

    await tx.booking.update({
      where: { id: booking.id },
      data: { startDate: newStart, endDate: newEnd, totalPrice: newTotal, version: { increment: 1 } },
    });

    if (booking.invoice && ['PENDING', 'PARTIALLY_PAID', 'PAID'].includes(booking.invoice.status)) {
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
      const droppedFromPaid = newStatus !== 'PAID' && booking.invoice.status === 'PAID';
      await tx.invoice.update({
        where: { id: booking.invoice.id },
        data: {
          amount: newTotal,
          status: newStatus,
          ...(droppedFromPaid && { paidAt: null }),
        },
      });
    }

    return { kind: 'ok' };
  }, { isolationLevel: 'Serializable' });

  if (editTxResult.kind === 'capacity_exceeded') {
    throw new BookingError('CAPACITY_EXCEEDED', { message: 'Capacity exceeded', payload: editTxResult.payload });
  }

  if (booking.invoice) {
    const { allocatePayments } = await import('@/lib/payments');
    await allocatePayments(booking.invoice.id);
  }

  await logAction({
    userId: actorId,
    action: 'BOOKING_DATES_EDITED',
    entityType: 'Booking',
    entityId: booking.id,
    details: { oldStartDate, oldEndDate, newStartDate: newStartStr, newEndDate: newEndStr, newNights, newTotal },
  });

  return { message: 'dates_updated', newStartDate: newStartStr, newEndDate: newEndStr, newNights, newTotal };
}
