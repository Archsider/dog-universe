import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBookingValidationNotification, createBookingRefusalNotification, createBookingInProgressNotification, createBookingCompletedNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';

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

  const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'CANCELLED', 'REJECTED', 'COMPLETED', 'PENDING_EXTENSION'];
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      invoice: true,
    },
  });
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ── PENDING_EXTENSION: Approve (merge into original) ──────────────────────
  if (body.approveExtension && booking.status === 'PENDING_EXTENSION') {
    if (!booking.extensionForBookingId) {
      return NextResponse.json({ error: 'NO_ORIGINAL_BOOKING' }, { status: 400 });
    }

    const originalBooking = await prisma.booking.findUnique({
      where: { id: booking.extensionForBookingId },
      include: { invoice: true, bookingPets: { include: { pet: true } }, client: true },
    });

    if (!originalBooking) {
      return NextResponse.json({ error: 'ORIGINAL_BOOKING_NOT_FOUND' }, { status: 404 });
    }

    const newEndDate = booking.endDate ?? booking.startDate;

    // Invoice merge: original_total + extension_total = new total
    const ancienTotal = originalBooking.invoice?.amount ?? originalBooking.totalPrice;
    const montantExtension = booking.invoice?.amount ?? booking.totalPrice;
    const newTotal = Math.round((ancienTotal + montantExtension) * 100) / 100;

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

    // Update booking and invoice
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: params.id },
        data: { startDate: newStart, endDate: newEnd, totalPrice: newTotal },
      });

      if (booking.invoice && ['PENDING', 'PARTIALLY_PAID', 'PAID'].includes(booking.invoice.status)) {
        const newPaidAmount = booking.invoice.paidAmount;
        const newStatus = newPaidAmount >= newTotal ? 'PAID' : newPaidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';
        await tx.invoice.update({
          where: { id: booking.invoice.id },
          data: { amount: newTotal, status: newStatus },
        });
      }
    });

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

    // Invoice impact — always update existing, never create supplementary
    let invoiceWarning = false;
    if (booking.invoice) {
      if (['PENDING', 'PARTIALLY_PAID'].includes(booking.invoice.status)) {
        const newPaidAmount = booking.invoice.paidAmount;
        const newStatus = newPaidAmount >= newTotal ? 'PAID' : newPaidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';
        await prisma.invoice.update({
          where: { id: booking.invoice.id },
          data: { amount: newTotal, status: newStatus },
        });
      } else if (booking.invoice.status === 'PAID') {
        // Invoice already paid — update total (may now be partially paid)
        const newStatus = booking.invoice.paidAmount >= newTotal ? 'PAID' : 'PARTIALLY_PAID';
        await prisma.invoice.update({
          where: { id: booking.invoice.id },
          data: { amount: newTotal, status: newStatus },
        });
        if (booking.invoice.paidAmount < newTotal) {
          invoiceWarning = true; // remainder needs to be collected
        }
      }
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
    const petNames = booking.bookingPets.map(bp => bp.pet.name).join(', ');
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
      }, userLang);
      await sendEmail({ to: booking.client.email, subject, html });

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
      }, userLang);
      await sendEmail({ to: booking.client.email, subject, html });

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

  const booking = await prisma.booking.findUnique({ where: { id: params.id } });
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
