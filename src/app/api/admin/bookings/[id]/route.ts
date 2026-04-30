import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import {
  createBookingValidationNotification,
  createBookingRefusalNotification,
  createBookingInProgressNotification,
  createBookingCompletedNotification,
  createBookingNoShowNotification,
  promoteWaitlistedBooking,
} from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import {
  sendSMS, sendAdminSMS, formatDateFR,
  petVerb, petArrived, petChouchoute,
} from '@/lib/sms';
import { enqueueEmail, enqueueSms } from '@/lib/queues/index';
import { checkBoardingCapacity } from '@/lib/capacity';
import { revalidateTag } from 'next/cache';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: id, deletedAt: null },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: true,
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(booking);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { status, notes } = body;

  const VALID_STATUSES = [
    'PENDING', 'CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS',
    'CANCELLED', 'REJECTED', 'COMPLETED', 'NO_SHOW',
    'WAITLIST', 'PENDING_EXTENSION',
  ];
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: id, deletedAt: null },
    include: {
      client: true,
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: true,
    },
  });
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ── Status transition guards ──────────────────────────────────────────────
  // NO_SHOW : seulement depuis CONFIRMED ou IN_PROGRESS (pas depuis PENDING,
  // CANCELLED, COMPLETED, WAITLIST, etc. — un séjour non confirmé ne peut
  // pas être un "no-show", il est juste annulé).
  if (status === 'NO_SHOW' && !['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
    return NextResponse.json(
      { error: 'INVALID_TRANSITION', message: 'NO_SHOW only from CONFIRMED or IN_PROGRESS' },
      { status: 400 },
    );
  }
  // WAITLIST : un booking déjà sur liste d'attente ne peut sortir que vers
  // PENDING (promotion manuelle) ou CANCELLED (le client se désiste).
  if (
    status &&
    booking.status === 'WAITLIST' &&
    !['PENDING', 'CANCELLED', 'WAITLIST'].includes(status)
  ) {
    return NextResponse.json(
      { error: 'INVALID_TRANSITION', message: 'From WAITLIST only PENDING or CANCELLED' },
      { status: 400 },
    );
  }

  // ── Patch BoardingDetail fields (taxi return / taxi go) ───────────────────
  if (body.patchBoardingDetail !== undefined) {
    if (booking.serviceType !== 'BOARDING') {
      return NextResponse.json({ error: 'Only applies to BOARDING bookings' }, { status: 400 });
    }
    const ALLOWED_BD_FIELDS = [
      'taxiReturnEnabled', 'taxiReturnDate', 'taxiReturnTime', 'taxiReturnAddress',
      'taxiGoEnabled', 'taxiGoDate', 'taxiGoTime', 'taxiGoAddress',
      'includeGrooming', 'groomingSize', 'groomingPrice', 'groomingStatus',
    ];
    const patch = body.patchBoardingDetail as Record<string, unknown>;
    const invalidKeys = Object.keys(patch).filter(k => !ALLOWED_BD_FIELDS.includes(k));
    if (invalidKeys.length > 0) {
      return NextResponse.json({ error: `Invalid fields: ${invalidKeys.join(', ')}` }, { status: 400 });
    }
    await prisma.boardingDetail.upsert({
      where: { bookingId: id },
      update: patch,
      create: { bookingId: id, ...patch },
    });
    await logAction({
      userId: session.user.id,
      action: 'BOARDING_DETAIL_PATCHED',
      entityType: 'Booking',
      entityId: id,
      details: { patch },
    });

    // Create TaxiTrip for each enabled taxi leg (idempotent — skip if already exists)
    const bd = await prisma.boardingDetail.findUnique({ where: { bookingId: id } });
    if (bd?.taxiGoEnabled) {
      const exists = await prisma.taxiTrip.findFirst({ where: { bookingId: id, tripType: 'OUTBOUND' } });
      if (!exists) {
        const t = await prisma.taxiTrip.create({
          data: { bookingId: id, tripType: 'OUTBOUND', status: 'PLANNED',
                  date: bd.taxiGoDate ?? undefined, time: bd.taxiGoTime ?? undefined,
                  address: bd.taxiGoAddress ?? undefined },
        });
        await prisma.taxiStatusHistory.create({ data: { taxiTripId: t.id, status: 'PLANNED', updatedBy: session.user.id } });
      } else {
        await prisma.taxiTrip.update({
          where: { id: exists.id },
          data: { date: bd.taxiGoDate ?? undefined, time: bd.taxiGoTime ?? undefined, address: bd.taxiGoAddress ?? undefined },
        });
      }
    }
    if (bd?.taxiReturnEnabled) {
      const exists = await prisma.taxiTrip.findFirst({ where: { bookingId: id, tripType: 'RETURN' } });
      if (!exists) {
        const t = await prisma.taxiTrip.create({
          data: { bookingId: id, tripType: 'RETURN', status: 'PLANNED',
                  date: bd.taxiReturnDate ?? undefined, time: bd.taxiReturnTime ?? undefined,
                  address: bd.taxiReturnAddress ?? undefined },
        });
        await prisma.taxiStatusHistory.create({ data: { taxiTripId: t.id, status: 'PLANNED', updatedBy: session.user.id } });
      } else {
        await prisma.taxiTrip.update({
          where: { id: exists.id },
          data: { date: bd.taxiReturnDate ?? undefined, time: bd.taxiReturnTime ?? undefined, address: bd.taxiReturnAddress ?? undefined },
        });
      }
    }

    const updated = await prisma.boardingDetail.findUnique({ where: { bookingId: id } });
    return NextResponse.json({ message: 'boarding_detail_patched', boardingDetail: updated });
  }
  // ── End patchBoardingDetail ───────────────────────────────────────────────

  // ── PENDING_EXTENSION: Approve (merge into original) ──────────────────────
  if (body.approveExtension && booking.status === 'PENDING_EXTENSION') {
    if (!booking.extensionForBookingId) {
      return NextResponse.json({ error: 'NO_ORIGINAL_BOOKING' }, { status: 400 });
    }

    const originalBooking = await prisma.booking.findFirst({
      where: { id: booking.extensionForBookingId, deletedAt: null },
      include: { invoice: true, bookingPets: { include: { pet: true } }, boardingDetail: true, client: true },
    });

    if (!originalBooking) {
      return NextResponse.json({ error: 'ORIGINAL_BOOKING_NOT_FOUND' }, { status: 404 });
    }

    const newEndDate = booking.endDate ?? booking.startDate;

    // Capacity check for the extension window (period originalBooking.endDate → newEndDate).
    // excludeBookingId prevents the original booking from counting against itself
    // (its endDate equals the extension startDate, so the overlap predicate fires).
    const extCapacity1 = await checkBoardingCapacity({
      petIds: originalBooking.bookingPets.map(bp => bp.pet.id),
      startDate: originalBooking.endDate ?? originalBooking.startDate,
      endDate: newEndDate,
      excludeBookingId: originalBooking.id,
    });
    if (!extCapacity1.ok) {
      return NextResponse.json({ error: 'CAPACITY_EXCEEDED', ...extCapacity1 }, { status: 400 });
    }

    // Recalculate new total based on the full merged duration (not a naive sum)
    // The extension booking is created with totalPrice:0 and no invoice, so summing would
    // produce the original total unchanged — i.e. a free extension. We compute from scratch.
    const { calculateBoardingTotalForExtension, getPricingSettings } = await import('@/lib/pricing');
    const pricingSettingsForExt = await getPricingSettings();
    const petsForExt = originalBooking.bookingPets.map(bp => bp.pet);
    const mergedNights = Math.floor(
      (newEndDate.getTime() - originalBooking.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const groomingPriceForExt = originalBooking.boardingDetail?.groomingPrice ?? 0;
    const taxiAddonPriceForExt = originalBooking.boardingDetail?.taxiAddonPrice ?? 0;
    const newTotal = Math.round(
      calculateBoardingTotalForExtension(petsForExt, mergedNights, groomingPriceForExt, taxiAddonPriceForExt, pricingSettingsForExt) * 100
    ) / 100;

    if (newTotal <= 0) {
      return NextResponse.json({ error: 'INVALID_COMPUTED_TOTAL' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // Migrate photos and items from extension booking to original
      await tx.stayPhoto.updateMany({ where: { bookingId: id }, data: { bookingId: originalBooking.id } });
      await tx.bookingItem.updateMany({ where: { bookingId: id }, data: { bookingId: originalBooking.id } });

      // Update invoice
      if (originalBooking.invoice && booking.invoice) {
        const newPaidAmount = Math.round((originalBooking.invoice.paidAmount + booking.invoice.paidAmount) * 100) / 100;
        const newStatus = newPaidAmount >= newTotal ? 'PAID' : newPaidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';
        await tx.invoice.update({
          where: { id: originalBooking.invoice.id },
          data: {
            amount: newTotal,
            paidAmount: newPaidAmount,
            status: newStatus,
            ...(newStatus === 'PAID' && !originalBooking.invoice.paidAt ? { paidAt: new Date() } : {}),
          },
        });
        await tx.invoiceItem.deleteMany({ where: { invoiceId: booking.invoice.id } });
        await tx.invoice.delete({ where: { id: booking.invoice.id } });
      } else if (!originalBooking.invoice && booking.invoice) {
        await tx.invoice.update({ where: { id: booking.invoice.id }, data: { bookingId: originalBooking.id, amount: newTotal } });
      } else if (originalBooking.invoice && !booking.invoice) {
        const newPaidAmount = originalBooking.invoice.paidAmount;
        const newStatus = newPaidAmount >= newTotal ? 'PAID' : newPaidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';
        await tx.invoice.update({ where: { id: originalBooking.invoice.id }, data: { amount: newTotal, status: newStatus } });
      }

      // Update original booking end date and total
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

      // Delete the extension booking (cascades BookingPets, BoardingDetail, etc.)
      await tx.booking.delete({ where: { id: id } });
    });

    const bookingRef = originalBooking.id.slice(0, 8).toUpperCase();
    const newEndDateDisplay = newEndDate.toLocaleDateString(originalBooking.client?.language === 'en' ? 'en-GB' : 'fr-MA');
    const { createBookingExtendedNotification } = await import('@/lib/notifications');
    await createBookingExtendedNotification(originalBooking.clientId, bookingRef, newEndDateDisplay, originalBooking.client?.language ?? 'fr').catch(() => {});

    await logAction({
      userId: session.user.id,
      action: 'EXTENSION_APPROVED',
      entityType: 'Booking',
      entityId: originalBooking.id,
      details: { extensionBookingId: id, newEndDate: newEndDate.toISOString().slice(0, 10), newTotal },
    });

    return NextResponse.json({ message: 'extension_approved', originalBookingId: originalBooking.id, newTotal });
  }

  // ── PENDING_EXTENSION: Reject (delete extension booking) ─────────────────
  if (body.rejectExtension && booking.status === 'PENDING_EXTENSION') {
    const originalBookingId = booking.extensionForBookingId;

    await prisma.$transaction(async (tx) => {
      // Delete extension invoice if exists
      if (booking.invoice) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: booking.invoice.id } });
        await tx.invoice.delete({ where: { id: booking.invoice.id } });
      }
      await tx.booking.delete({ where: { id: id } });

      // Clear hasExtensionRequest flag on original booking
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
      await createExtensionRejectedNotification(booking.clientId, bookingRef).catch(() => {});
    }

    await logAction({
      userId: session.user.id,
      action: 'EXTENSION_REJECTED',
      entityType: 'Booking',
      entityId: id,
      details: { originalBookingId },
    });

    return NextResponse.json({ message: 'extension_rejected', originalBookingId });
  }

  // ── Edit dates (admin corrects start/end date + regenerates invoice) ──────
  if (body.editDates) {
    const { startDate: newStartStr, endDate: newEndStr } = body.editDates as { startDate?: string; endDate?: string };
    if (!newStartStr || !newEndStr) {
      return NextResponse.json({ error: 'editDates requires startDate and endDate' }, { status: 400 });
    }

    // Block edit if invoice is PAID unless the admin explicitly acknowledges the risk
    if (booking.invoice?.status === 'PAID' && !body.forcePaidInvoice) {
      return NextResponse.json({ error: 'INVOICE_ALREADY_PAID', hint: 'Pass forcePaidInvoice:true to override' }, { status: 409 });
    }

    const newStart = new Date(newStartStr + 'T12:00:00Z');
    const newEnd = new Date(newEndStr + 'T12:00:00Z');

    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
      return NextResponse.json({ error: 'Invalid dates' }, { status: 400 });
    }
    if (newEnd <= newStart) {
      return NextResponse.json({ error: 'endDate must be after startDate' }, { status: 400 });
    }

    const newNights = Math.floor((newEnd.getTime() - newStart.getTime()) / (1000 * 60 * 60 * 24));

    // Recalculate price
    let newTotal = booking.totalPrice;
    if (booking.serviceType === 'BOARDING') {
      const { calculateBoardingTotalForExtension, getPricingSettings } = await import('@/lib/pricing');
      const pricingSettings = await getPricingSettings();
      const pets = booking.bookingPets.map(bp => bp.pet);
      const groomingPrice = booking.boardingDetail?.groomingPrice ?? 0;
      const taxiAddonPrice = booking.boardingDetail?.taxiAddonPrice ?? 0;
      newTotal = calculateBoardingTotalForExtension(pets, newNights, groomingPrice, taxiAddonPrice, pricingSettings);
    }

    if (newTotal <= 0) {
      return NextResponse.json({ error: 'INVALID_COMPUTED_TOTAL' }, { status: 400 });
    }

    // Update booking and invoice
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: id },
        data: { startDate: newStart, endDate: newEnd, totalPrice: newTotal },
      });

      if (booking.invoice && ['PENDING', 'PARTIALLY_PAID', 'PAID'].includes(booking.invoice.status)) {
        // Update pension InvoiceItems to reflect the new night count
        const invoiceItems = await tx.invoiceItem.findMany({
          where: { invoiceId: booking.invoice.id },
        });
        for (const item of invoiceItems) {
          const d = item.description.toLowerCase();
          const isPensionItem = (d.includes('pension') || d.includes('boarding')) && !d.includes('taxi');
          if (isPensionItem && item.unitPrice > 0) {
            await tx.invoiceItem.update({
              where: { id: item.id },
              data: { quantity: newNights, total: newNights * item.unitPrice },
            });
          }
        }

        const newPaidAmount = booking.invoice.paidAmount;
        const newStatus = newPaidAmount >= newTotal ? 'PAID' : newPaidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';
        await tx.invoice.update({
          where: { id: booking.invoice.id },
          data: { amount: newTotal, status: newStatus },
        });
      }
    });

    // Reallocate payments after dates/items update
    if (booking.invoice) {
      const { allocatePayments } = await import('@/lib/payments');
      await allocatePayments(booking.invoice.id);
    }

    await logAction({
      userId: session.user.id,
      action: 'BOOKING_DATES_EDITED',
      entityType: 'Booking',
      entityId: id,
      details: { newStartDate: newStartStr, newEndDate: newEndStr, newNights, newTotal },
    });

    return NextResponse.json({ message: 'dates_updated', newStartDate: newStartStr, newEndDate: newEndStr, newNights, newTotal });
  }

  // ── Extension: direct admin extend OR approve client request (flag-based) ─
  const newEndDateStr: string | undefined = body.extendEndDate ?? (body.approveExtension ? booking.extensionRequestedEndDate?.toISOString().slice(0, 10) : undefined);

  if (newEndDateStr || body.rejectExtension) {
    if (booking.serviceType !== 'BOARDING') {
      return NextResponse.json({ error: 'Extensions only apply to boarding stays' }, { status: 400 });
    }

    // ── Reject extension request (flag-based) ────────────────────────────────
    if (body.rejectExtension) {
      if (!booking.hasExtensionRequest) {
        return NextResponse.json({ error: 'No pending extension request' }, { status: 400 });
      }
      await prisma.booking.update({
        where: { id: id },
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
        userId: session.user.id,
        action: 'EXTENSION_REJECTED',
        entityType: 'Booking',
        entityId: id,
        details: { bookingRef },
      });
      return NextResponse.json({ message: 'extension_rejected' });
    }

    // ── Apply extension (direct or approved) ─────────────────────────────────
    // Block if invoice is PAID unless admin explicitly acknowledges the risk
    if (booking.invoice?.status === 'PAID' && !body.forcePaidInvoice) {
      return NextResponse.json({ error: 'INVOICE_ALREADY_PAID', hint: 'Pass forcePaidInvoice:true to override' }, { status: 409 });
    }

    const newEndDate = new Date(newEndDateStr + 'T12:00:00');
    if (isNaN(newEndDate.getTime())) {
      return NextResponse.json({ error: 'Invalid end date' }, { status: 400 });
    }
    if (newEndDate <= booking.startDate) {
      return NextResponse.json({ error: 'New end date must be after start date' }, { status: 400 });
    }
    if (booking.endDate && newEndDate <= booking.endDate) {
      return NextResponse.json({ error: 'New end date must be after current end date' }, { status: 400 });
    }

    // Capacity check for the extension window (booking.endDate → newEndDate).
    // excludeBookingId prevents the booking from counting against itself
    // (its current endDate equals the extension startDate, triggering the overlap predicate).
    const extCapacity2 = await checkBoardingCapacity({
      petIds: booking.bookingPets.map(bp => bp.pet.id),
      startDate: booking.endDate ?? booking.startDate,
      endDate: newEndDate,
      excludeBookingId: id,
    });
    if (!extCapacity2.ok) {
      return NextResponse.json({ error: 'CAPACITY_EXCEEDED', ...extCapacity2 }, { status: 400 });
    }

    const newNights = Math.floor((newEndDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const pets = booking.bookingPets.map(bp => bp.pet);
    const groomingPrice = booking.boardingDetail?.groomingPrice ?? 0;
    const taxiAddonPrice = booking.boardingDetail?.taxiAddonPrice ?? 0;

    const { calculateBoardingTotalForExtension, getPricingSettings } = await import('@/lib/pricing');
    const pricingSettings = await getPricingSettings();
    const newTotal = calculateBoardingTotalForExtension(pets, newNights, groomingPrice, taxiAddonPrice, pricingSettings);

    if (newTotal <= 0) {
      return NextResponse.json({ error: 'INVALID_COMPUTED_TOTAL' }, { status: 400 });
    }

    // Invoice impact — always update existing, never create supplementary
    let invoiceWarning = false;
    if (booking.invoice) {
      if (['PENDING', 'PARTIALLY_PAID', 'PAID'].includes(booking.invoice.status)) {
        // Update pension InvoiceItems to reflect the new night count
        const invoiceItems = await prisma.invoiceItem.findMany({
          where: { invoiceId: booking.invoice.id },
        });
        for (const item of invoiceItems) {
          const d = item.description.toLowerCase();
          const isPensionItem = (d.includes('pension') || d.includes('boarding')) && !d.includes('taxi');
          if (isPensionItem && item.unitPrice > 0) {
            await prisma.invoiceItem.update({
              where: { id: item.id },
              data: { quantity: newNights, total: newNights * item.unitPrice },
            });
          }
        }

        const newPaidAmount = booking.invoice.paidAmount;
        const newStatus = newPaidAmount >= newTotal ? 'PAID' : newPaidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';
        await prisma.invoice.update({
          where: { id: booking.invoice.id },
          data: {
            amount: newTotal,
            status: newStatus,
            ...(newStatus !== 'PAID' && booking.invoice.status === 'PAID' ? { paidAt: null } : {}),
          },
        });
        if (booking.invoice.status === 'PAID' && newPaidAmount < newTotal) {
          invoiceWarning = true; // remainder needs to be collected
        }
      }

      // Reallocate payments across the updated items
      const { allocatePayments } = await import('@/lib/payments');
      await allocatePayments(booking.invoice.id);
    }

    await prisma.booking.update({
      where: { id: id },
      data: {
        endDate: newEndDate,
        totalPrice: newTotal,
        hasExtensionRequest: false,
        extensionRequestedEndDate: null,
        extensionRequestNote: null,
      },
    });

    const bookingRef = booking.id.slice(0, 8).toUpperCase();
    const newEndDateDisplay = newEndDate.toLocaleDateString(booking.client.language === 'en' ? 'en-GB' : 'fr-MA');
    const { createBookingExtendedNotification } = await import('@/lib/notifications');
    await createBookingExtendedNotification(booking.clientId, bookingRef, newEndDateDisplay, booking.client.language ?? 'fr').catch(() => {});

    await logAction({
      userId: session.user.id,
      action: body.approveExtension ? 'EXTENSION_APPROVED' : 'EXTENSION_DIRECT',
      entityType: 'Booking',
      entityId: id,
      details: { newEndDate: newEndDateStr, newTotal, invoiceWarning },
    });

    return NextResponse.json({ message: 'extended', newEndDate: newEndDateStr, newTotal, invoiceWarning });
  }
  // ── End extension handling ────────────────────────────────────────────────────

  const updated = await Sentry.startSpan(
    { name: 'booking.statusUpdate', op: 'db' },
    () => prisma.booking.update({
      where: { id: id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
      },
    }),
  );

  // Send notifications on status change
  if (status && status !== booking.status) {
    const userLang = booking.client.language || 'fr';
    const pets = booking.bookingPets.map(bp => bp.pet);
    const petNames = pets.map(p => p.name).join(' et ');
    const firstName = (booking.client.name ?? booking.client.email).split(' ')[0];
    const bookingRef = booking.id.slice(0, 8).toUpperCase();

    if (status === 'CONFIRMED') {
      const fmtLocale = userLang === 'fr' ? 'fr-MA' : 'en-GB';
      const startDateFmt = booking.startDate.toLocaleDateString(fmtLocale);
      const endDateFmt = booking.endDate ? booking.endDate.toLocaleDateString(fmtLocale) : '';
      const dates = endDateFmt ? `${startDateFmt} – ${endDateFmt}` : startDateFmt;
      await createBookingValidationNotification(booking.clientId, bookingRef, petNames, dates);
      const { subject, html } = getEmailTemplate('booking_validated', {
        clientName: booking.client.name ?? booking.client.email,
        bookingRef,
        service: booking.serviceType === 'BOARDING' ? (userLang === 'fr' ? 'Pension' : 'Boarding') : 'Pet Taxi',
        petName: petNames,
        startDate: startDateFmt,
        endDate: endDateFmt,
      }, userLang, pets);
      enqueueEmail(
        { to: booking.client.email, subject, html },
        `${id}:confirmed-email`,
      ).catch(() => {});

      // SMS client confirmation — accord genre/pluriel (queued)
      const dateRange = booking.serviceType === 'BOARDING' && booking.endDate
        ? `du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
        : `le ${formatDateFR(booking.startDate)}`;
      const venueLine = booking.serviceType === 'BOARDING'
        ? `${petNames} ${petVerb(pets)} chez Dog Universe ${dateRange}. Nous ${pets.length > 1 ? 'les' : "l'"} attendons avec impatience !`
        : `Transport prévu pour ${petNames} ${dateRange}.`;
      enqueueSms(
        { to: booking.client.phone, message: `Bonjour ${firstName} ! ${venueLine} — Dog Universe 🐾` },
        `${id}:confirmed-sms-client`,
      ).catch(() => {});

      // SMS admin — réservation confirmée (queued)
      const confirmRangeAdmin = booking.serviceType === 'BOARDING' && booking.endDate
        ? ` du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
        : ` le ${formatDateFR(booking.startDate)}`;
      enqueueSms(
        { to: 'ADMIN', message: `✅ Résa confirmée : ${petNames} de ${booking.client.name}${confirmRangeAdmin}.` },
        `${id}:confirmed-sms-admin`,
      ).catch(() => {});

      // For PET_TAXI: ensure a STANDALONE TaxiTrip exists
      if (booking.serviceType === 'PET_TAXI') {
        const existingTrip = await prisma.taxiTrip.findFirst({ where: { bookingId: id } });
        if (!existingTrip) {
          const dateStr = booking.startDate.toISOString().slice(0, 10);
          const t = await prisma.taxiTrip.create({
            data: {
              bookingId: id,
              tripType: 'STANDALONE',
              status: 'PLANNED',
              date: dateStr,
              time: booking.arrivalTime ?? undefined,
              taxiType: booking.taxiDetail?.taxiType ?? undefined,
              price: booking.taxiDetail?.price ?? 0,
            },
          });
          await prisma.taxiStatusHistory.create({ data: { taxiTripId: t.id, status: 'PLANNED', updatedBy: session.user.id } });
        }
      }

      await logAction({
        userId: session.user.id,
        action: LOG_ACTIONS.BOOKING_CONFIRMED,
        entityType: 'Booking',
        entityId: id,
        details: { from: booking.status, to: status },
      });
    } else if (status === 'REJECTED' || status === 'CANCELLED') {
      // Si le booking annulé était sur WAITLIST, il n'a jamais consommé de
      // place — pas la peine d'envoyer le SMS / email "annulation" ni de
      // déclencher la promotion d'un autre WAITLIST. On log juste.
      const wasActiveSlot = booking.status !== 'WAITLIST';

      if (wasActiveSlot) {
        await createBookingRefusalNotification(booking.clientId, bookingRef);
        const { subject, html } = getEmailTemplate('booking_refused', {
          clientName: booking.client.name ?? booking.client.email,
          bookingRef,
          petName: petNames,
        }, userLang, pets);
        enqueueEmail(
          { to: booking.client.email, subject, html },
          `${id}:refused-email`,
        ).catch(() => {});

        // SMS client annulation + SMS admin alerte (queued)
        enqueueSms(
          { to: booking.client.phone, message: `Bonjour ${firstName}, votre réservation pour ${petNames} a été annulée. Nous restons disponibles. — Dog Universe` },
          `${id}:refused-sms-client`,
        ).catch(() => {});
        const adminDateRange = booking.serviceType === 'BOARDING' && booking.endDate
          ? ` du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
          : ` le ${formatDateFR(booking.startDate)}`;
        enqueueSms(
          { to: 'ADMIN', message: `⚠️ Annulation : ${petNames} de ${booking.client.name}${adminDateRange}.` },
          `${id}:refused-sms-admin`,
        ).catch(() => {});
      }

      await logAction({
        userId: session.user.id,
        action: status === 'REJECTED' ? LOG_ACTIONS.BOOKING_REJECTED : LOG_ACTIONS.BOOKING_CANCELLED,
        entityType: 'Booking',
        entityId: id,
        details: { from: booking.status, to: status, wasWaitlist: !wasActiveSlot },
      });

      // Une place se libère sur ces dates → promouvoir le 1er WAITLIST
      // (createdAt ASC) qui chevauche la fenêtre. Non bloquant.
      if (wasActiveSlot && booking.serviceType === 'BOARDING' && booking.endDate) {
        promoteWaitlistedBooking({
          startDate: booking.startDate,
          endDate: booking.endDate,
        }).catch((err) => console.error('[bookings] waitlist promotion failed:', err));
      }
    } else if (status === 'NO_SHOW') {
      // Client absent sans préavis. Notification informative, pas d'email
      // formel (l'admin contactera directement si nécessaire). Log dédié
      // sous BOOKING_CANCELLED car NO_SHOW est sémantiquement une non-venue.
      await createBookingNoShowNotification(booking.clientId, bookingRef, petNames);

      enqueueSms(
        { to: 'ADMIN', message: `🚫 No Show : ${petNames} de ${booking.client.name} (réf. ${bookingRef}).` },
        `${id}:no-show-sms-admin`,
      ).catch(() => {});

      await logAction({
        userId: session.user.id,
        action: LOG_ACTIONS.BOOKING_CANCELLED,
        entityType: 'Booking',
        entityId: id,
        details: { from: booking.status, to: 'NO_SHOW' },
      });

      // NO_SHOW libère aussi la place — promouvoir le 1er WAITLIST.
      if (booking.serviceType === 'BOARDING' && booking.endDate) {
        promoteWaitlistedBooking({
          startDate: booking.startDate,
          endDate: booking.endDate,
        }).catch((err) => console.error('[bookings] waitlist promotion failed:', err));
      }
    } else if (status === 'COMPLETED') {
      const hasGrooming = booking.boardingDetail?.includeGrooming ?? false;
      await createBookingCompletedNotification(
        booking.clientId,
        bookingRef,
        petNames,
        booking.serviceType as 'BOARDING' | 'PET_TAXI',
        hasGrooming
      );

      // SMS client séjour terminé (queued)
      enqueueSms(
        { to: booking.client.phone, message: `Bonjour ${firstName} ! Le séjour de ${petNames} est terminé. Ce fut un plaisir de ${pets.length > 1 ? 'les' : "l'"} accueillir. À très bientôt ! — Dog Universe 🐾` },
        `${id}:completed-sms-client`,
      ).catch(() => {});

      // SMS admin — séjour terminé (queued)
      enqueueSms(
        { to: 'ADMIN', message: `✅ Départ : ${petNames} de ${booking.client.name} a quitté la pension.` },
        `${id}:completed-sms-admin`,
      ).catch(() => {});

      await logAction({
        userId: session.user.id,
        action: LOG_ACTIONS.BOOKING_COMPLETED,
        entityType: 'Booking',
        entityId: id,
        details: { from: booking.status, to: status },
      });

      // Recalculate loyalty grade on booking completion
      try {
        const { calculateSuggestedGrade } = await import('@/lib/loyalty');
        const { createLoyaltyUpdateNotification } = await import('@/lib/notifications');
        const [totalStays, totalPaid, currentGrade] = await Promise.all([
          prisma.booking.count({ where: { clientId: booking.clientId, status: 'COMPLETED', deletedAt: null } }),
          prisma.invoice.aggregate({ where: { clientId: booking.clientId, status: 'PAID' }, _sum: { amount: true } }),
          prisma.loyaltyGrade.findUnique({ where: { clientId: booking.clientId } }),
        ]);
        const suggestedGrade = calculateSuggestedGrade(totalStays, totalPaid._sum.amount ?? 0);
        if (currentGrade && !currentGrade.isOverride && currentGrade.grade !== suggestedGrade) {
          await prisma.loyaltyGrade.update({
            where: { clientId: booking.clientId },
            data: { grade: suggestedGrade },
          });
          const { invalidateLoyaltyCache } = await import('@/lib/loyalty-server');
          await invalidateLoyaltyCache(booking.clientId);
          await createLoyaltyUpdateNotification(booking.clientId, suggestedGrade, booking.client.language || 'fr');
        }
      } catch { /* non-blocking */ }
    } else if (status === 'IN_PROGRESS') {
      await createBookingInProgressNotification(
        booking.clientId,
        bookingRef,
        petNames,
        booking.serviceType as 'BOARDING' | 'PET_TAXI'
      );

      // SMS client : animal arrivé — skip si livraison taxi STANDALONE déjà
      // confirmée (le taxi-trip route a déjà envoyé son propre SMS d'arrivée).
      const hasTaxiDelivered = await prisma.taxiTrip.findFirst({
        where: {
          bookingId: booking.id,
          tripType: 'STANDALONE',
          status: 'ARRIVED_AT_PENSION',
        },
        select: { id: true },
      });
      if (!hasTaxiDelivered) {
        enqueueSms(
          { to: booking.client.phone, message: `Bonjour ${firstName} ! ${petNames} ${petVerb(pets, 'present')} bien ${petArrived(pets)} et déjà ${petChouchoute(pets)}. Nous en prenons soin. — Dog Universe 🐾` },
          `${id}:in-progress-sms-client`,
        ).catch(() => {});
      }

      // SMS admin — arrivée confirmée (queued)
      enqueueSms(
        { to: 'ADMIN', message: `🏠 Arrivée : ${petNames} de ${booking.client.name} est en pension.` },
        `${id}:in-progress-sms-admin`,
      ).catch(() => {});

      await logAction({
        userId: session.user.id,
        action: 'BOOKING_IN_PROGRESS',
        entityType: 'Booking',
        entityId: id,
        details: { from: booking.status, to: status },
      });
    }
  }

  // Status transition may move the booking out of (or into) PENDING — bust
  // the admin-counts cache so the sidebar badge reflects the new state.
  revalidateTag('admin-counts');

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: id, deletedAt: null },
    include: { invoice: { select: { id: true, status: true, invoiceNumber: true } } },
  });
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Refuse to delete a booking whose invoice has already been paid — this would
  // silently erase financial records. Cancel the booking instead.
  if (booking.invoice?.status === 'PAID') {
    return NextResponse.json(
      { error: 'BOOKING_HAS_PAID_INVOICE', invoiceNumber: booking.invoice.invoiceNumber },
      { status: 409 }
    );
  }

  await prisma.booking.update({ where: { id }, data: { deletedAt: new Date() } });

  await logAction({
    userId: session.user.id,
    action: 'BOOKING_DELETED',
    entityType: 'Booking',
    entityId: id,
    details: { status: booking.status, clientId: booking.clientId },
  });

  return NextResponse.json({ message: 'deleted' });
}
