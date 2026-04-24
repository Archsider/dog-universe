import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBookingValidationNotification, createBookingRefusalNotification, createBookingInProgressNotification, createBookingCompletedNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import {
  sendSMS, sendAdminSMS, formatDateFR,
  petVerb, petArrived, petChouchoute,
} from '@/lib/sms';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
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

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { status, notes } = body;

  const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS', 'CANCELLED', 'REJECTED', 'COMPLETED', 'PENDING_EXTENSION'];
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: true,
    },
  });
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
      where: { bookingId: params.id },
      update: patch,
      create: { bookingId: params.id, ...patch },
    });
    await logAction({
      userId: session.user.id,
      action: 'BOARDING_DETAIL_PATCHED',
      entityType: 'Booking',
      entityId: params.id,
      details: { patch },
    });

    // Create TaxiTrip for each enabled taxi leg (idempotent — skip if already exists)
    const bd = await prisma.boardingDetail.findUnique({ where: { bookingId: params.id } });
    if (bd?.taxiGoEnabled) {
      const exists = await prisma.taxiTrip.findFirst({ where: { bookingId: params.id, tripType: 'OUTBOUND' } });
      if (!exists) {
        const t = await prisma.taxiTrip.create({
          data: { bookingId: params.id, tripType: 'OUTBOUND', status: 'PLANNED',
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
      const exists = await prisma.taxiTrip.findFirst({ where: { bookingId: params.id, tripType: 'RETURN' } });
      if (!exists) {
        const t = await prisma.taxiTrip.create({
          data: { bookingId: params.id, tripType: 'RETURN', status: 'PLANNED',
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

    const updated = await prisma.boardingDetail.findUnique({ where: { bookingId: params.id } });
    return NextResponse.json({ message: 'boarding_detail_patched', boardingDetail: updated });
  }
  // ── End patchBoardingDetail ───────────────────────────────────────────────

  // ── PENDING_EXTENSION: Approve (merge into original) ──────────────────────
  if (body.approveExtension && booking.status === 'PENDING_EXTENSION') {
    if (!booking.extensionForBookingId) {
      return NextResponse.json({ error: 'NO_ORIGINAL_BOOKING' }, { status: 400 });
    }

    const originalBooking = await prisma.booking.findUnique({
      where: { id: booking.extensionForBookingId },
      include: { invoice: true, bookingPets: { include: { pet: true } }, boardingDetail: true, client: true },
    });

    if (!originalBooking) {
      return NextResponse.json({ error: 'ORIGINAL_BOOKING_NOT_FOUND' }, { status: 404 });
    }

    const newEndDate = booking.endDate ?? booking.startDate;

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
      await tx.stayPhoto.updateMany({ where: { bookingId: params.id }, data: { bookingId: originalBooking.id } });
      await tx.bookingItem.updateMany({ where: { bookingId: params.id }, data: { bookingId: originalBooking.id } });

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
      await tx.booking.delete({ where: { id: params.id } });
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
      details: { extensionBookingId: params.id, newEndDate: newEndDate.toISOString().slice(0, 10), newTotal },
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
      await tx.booking.delete({ where: { id: params.id } });

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
      entityId: params.id,
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
        where: { id: params.id },
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
      entityId: params.id,
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
        where: { id: params.id },
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
        entityId: params.id,
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
      where: { id: params.id },
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
      entityId: params.id,
      details: { newEndDate: newEndDateStr, newTotal, invoiceWarning },
    });

    return NextResponse.json({ message: 'extended', newEndDate: newEndDateStr, newTotal, invoiceWarning });
  }
  // ── End extension handling ────────────────────────────────────────────────────

  const updated = await prisma.booking.update({
    where: { id: params.id },
    data: {
      ...(status && { status }),
      ...(notes !== undefined && { notes }),
    },
  });

  // Send notifications on status change
  if (status && status !== booking.status) {
    const userLang = booking.client.language || 'fr';
    const pets = booking.bookingPets.map(bp => bp.pet);
    const petNames = pets.map(p => p.name).join(' et ');
    const firstName = (booking.client.name ?? booking.client.email).split(' ')[0];
    const bookingRef = booking.id.slice(0, 8).toUpperCase();

    if (status === 'CONFIRMED') {
      const dates = booking.startDate.toLocaleDateString('fr-MA');
      await createBookingValidationNotification(booking.clientId, bookingRef, petNames, dates);
      const { subject, html } = getEmailTemplate('booking_validated', {
        clientName: booking.client.name ?? booking.client.email,
        bookingRef,
        service: booking.serviceType === 'BOARDING' ? (userLang === 'fr' ? 'Pension' : 'Boarding') : 'Pet Taxi',
        petName: petNames,
        dates,
      }, userLang, pets);
      await sendEmail({ to: booking.client.email, subject, html });

      // SMS client confirmation — accord genre/pluriel
      const dateRange = booking.serviceType === 'BOARDING' && booking.endDate
        ? `du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
        : `le ${formatDateFR(booking.startDate)}`;
      const venueLine = booking.serviceType === 'BOARDING'
        ? `${petNames} ${petVerb(pets)} chez Dog Universe ${dateRange}. Nous ${pets.length > 1 ? 'les' : "l'"} attendons avec impatience !`
        : `Transport prévu pour ${petNames} ${dateRange}.`;
      await sendSMS(
        booking.client.phone,
        `Bonjour ${firstName} ! ${venueLine} — Dog Universe 🐾`,
      );

      // SMS admin — réservation confirmée
      const confirmRangeAdmin = booking.serviceType === 'BOARDING' && booking.endDate
        ? ` du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
        : ` le ${formatDateFR(booking.startDate)}`;
      await sendAdminSMS(
        `✅ Résa confirmée : ${petNames} de ${booking.client.name}${confirmRangeAdmin}.`
      );

      // For PET_TAXI: ensure a STANDALONE TaxiTrip exists
      if (booking.serviceType === 'PET_TAXI') {
        const existingTrip = await prisma.taxiTrip.findFirst({ where: { bookingId: params.id } });
        if (!existingTrip) {
          const dateStr = booking.startDate.toISOString().slice(0, 10);
          const t = await prisma.taxiTrip.create({
            data: {
              bookingId: params.id,
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
        entityId: params.id,
        details: { from: booking.status, to: status },
      });
    } else if (status === 'REJECTED' || status === 'CANCELLED') {
      await createBookingRefusalNotification(booking.clientId, bookingRef);
      const { subject, html } = getEmailTemplate('booking_refused', {
        clientName: booking.client.name ?? booking.client.email,
        bookingRef,
        petName: petNames,
      }, userLang, pets);
      await sendEmail({ to: booking.client.email, subject, html });

      // SMS client annulation + SMS admin alerte
      await sendSMS(
        booking.client.phone,
        `Bonjour ${firstName}, votre réservation pour ${petNames} a été annulée. Nous restons disponibles. — Dog Universe`,
      );
      const adminDateRange = booking.serviceType === 'BOARDING' && booking.endDate
        ? ` du ${formatDateFR(booking.startDate)} au ${formatDateFR(booking.endDate)}`
        : ` le ${formatDateFR(booking.startDate)}`;
      await sendAdminSMS(
        `⚠️ Annulation : ${petNames} de ${booking.client.name}${adminDateRange}.`,
      );

      await logAction({
        userId: session.user.id,
        action: status === 'REJECTED' ? LOG_ACTIONS.BOOKING_REJECTED : LOG_ACTIONS.BOOKING_CANCELLED,
        entityType: 'Booking',
        entityId: params.id,
        details: { from: booking.status, to: status },
      });
    } else if (status === 'COMPLETED') {
      const hasGrooming = booking.boardingDetail?.includeGrooming ?? false;
      await createBookingCompletedNotification(
        booking.clientId,
        bookingRef,
        petNames,
        booking.serviceType as 'BOARDING' | 'PET_TAXI',
        hasGrooming
      );

      // SMS client séjour terminé
      await sendSMS(
        booking.client.phone,
        `Bonjour ${firstName} ! Le séjour de ${petNames} est terminé. Ce fut un plaisir de ${pets.length > 1 ? 'les' : "l'"} accueillir. À très bientôt ! — Dog Universe 🐾`,
      );

      // SMS admin — séjour terminé
      await sendAdminSMS(
        `✅ Départ : ${petNames} de ${booking.client.name} a quitté la pension.`
      );

      await logAction({
        userId: session.user.id,
        action: LOG_ACTIONS.BOOKING_COMPLETED,
        entityType: 'Booking',
        entityId: params.id,
        details: { from: booking.status, to: status },
      });

      // Recalculate loyalty grade on booking completion
      try {
        const { calculateSuggestedGrade } = await import('@/lib/loyalty');
        const { createLoyaltyUpdateNotification } = await import('@/lib/notifications');
        const [totalStays, totalPaid, currentGrade] = await Promise.all([
          prisma.booking.count({ where: { clientId: booking.clientId, status: 'COMPLETED' } }),
          prisma.invoice.aggregate({ where: { clientId: booking.clientId, status: 'PAID' }, _sum: { amount: true } }),
          prisma.loyaltyGrade.findUnique({ where: { clientId: booking.clientId } }),
        ]);
        const suggestedGrade = calculateSuggestedGrade(totalStays, totalPaid._sum.amount ?? 0);
        if (currentGrade && !currentGrade.isOverride && currentGrade.grade !== suggestedGrade) {
          await prisma.loyaltyGrade.update({
            where: { clientId: booking.clientId },
            data: { grade: suggestedGrade },
          });
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
        await sendSMS(
          booking.client.phone,
          `Bonjour ${firstName} ! ${petNames} ${petVerb(pets, 'present')} bien ${petArrived(pets)} et déjà ${petChouchoute(pets)}. Nous en prenons soin. — Dog Universe 🐾`,
        );
      }

      // SMS admin — arrivée confirmée (toujours)
      await sendAdminSMS(
        `🏠 Arrivée : ${petNames} de ${booking.client.name} est en pension.`
      );

      await logAction({
        userId: session.user.id,
        action: 'BOOKING_IN_PROGRESS',
        entityType: 'Booking',
        entityId: params.id,
        details: { from: booking.status, to: status },
      });
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
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

  await prisma.$transaction(async (tx) => {
    // BookingPets, BoardingDetail, TaxiDetail cascade from Booking
    // Invoice items cascade from Invoice
    const invoice = await tx.invoice.findUnique({ where: { bookingId: params.id } });
    if (invoice) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoice.delete({ where: { id: invoice.id } });
    }
    await tx.booking.delete({ where: { id: params.id } });
  });

  await logAction({
    userId: session.user.id,
    action: 'BOOKING_DELETED',
    entityType: 'Booking',
    entityId: params.id,
    details: { status: booking.status, clientId: booking.clientId },
  });

  return NextResponse.json({ message: 'deleted' });
}
