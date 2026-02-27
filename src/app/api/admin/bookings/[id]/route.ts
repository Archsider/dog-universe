import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBookingValidationNotification, createBookingRefusalNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
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
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { status, notes } = body;

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
