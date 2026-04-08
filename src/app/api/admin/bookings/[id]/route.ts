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

  const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'CANCELLED', 'REJECTED', 'COMPLETED'];
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

  // ── Extension: direct admin extend OR approve client request ─────────────────
  const newEndDateStr: string | undefined = body.extendEndDate ?? (body.approveExtension ? booking.extensionRequestedEndDate?.toISOString().slice(0, 10) : undefined);

  if (newEndDateStr || body.rejectExtension) {
    if (booking.serviceType !== 'BOARDING') {
      return NextResponse.json({ error: 'Extensions only apply to boarding stays' }, { status: 400 });
    }

    // ── Reject extension request ─────────────────────────────────────────────
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

    // Invoice impact
    let invoiceWarning = false;
    if (booking.invoice) {
      if (booking.invoice.status === 'PENDING') {
        await prisma.invoice.update({ where: { id: booking.invoice.id }, data: { amount: newTotal } });
      } else if (booking.invoice.status === 'PARTIALLY_PAID') {
        // Update amount — paidAmount stays; status stays PARTIALLY_PAID (paidAmount < newTotal)
        await prisma.invoice.update({ where: { id: booking.invoice.id }, data: { amount: newTotal } });
      } else if (booking.invoice.status === 'PAID') {
        invoiceWarning = true; // Admin must handle billing manually
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
