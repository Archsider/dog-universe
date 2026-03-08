import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBookingValidationNotification, createBookingRefusalNotification } from '@/lib/notifications';
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

  const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED'];
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      bookingPets: { include: { pet: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
      const { subject, html } = getEmailTemplate('booking_confirmation', {
        clientName: booking.client.name,
        bookingRef,
        service: booking.serviceType === 'BOARDING' ? (userLang === 'fr' ? 'Pension' : 'Boarding') : 'Pet Taxi',
        petName: petNames,
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
      await createBookingRefusalNotification(booking.clientId, bookingRef, petNames);
      const { subject, html } = getEmailTemplate('booking_refused', {
        clientName: booking.client.name,
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
        // +1 because the current booking was just set to COMPLETED but DB count may not reflect it yet
        const suggestedGrade = calculateSuggestedGrade(totalStays + 1, totalPaid._sum.amount ?? 0);
        if (currentGrade && !currentGrade.isOverride && currentGrade.grade !== suggestedGrade) {
          await prisma.loyaltyGrade.update({
            where: { clientId: booking.clientId },
            data: { grade: suggestedGrade },
          });
          await createLoyaltyUpdateNotification(booking.clientId, suggestedGrade, booking.client.language || 'fr');
        }
      } catch { /* non-blocking */ }
    } else {
      await logAction({
        userId: session.user.id,
        action: LOG_ACTIONS.BOOKING_COMPLETED,
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
