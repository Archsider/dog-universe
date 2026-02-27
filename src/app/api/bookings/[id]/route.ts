import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBookingValidationNotification, createBookingRefusalNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { formatDateShort } from '@/lib/utils';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, language: true } },
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: true,
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role === 'CLIENT' && booking.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(booking);
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      client: true,
      bookingPets: { include: { pet: true } },
    },
  });

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Client can only cancel their own pending bookings
  if (session.user.role === 'CLIENT') {
    if (booking.clientId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (body.status !== 'CANCELLED') {
      return NextResponse.json({ error: 'Clients can only cancel bookings' }, { status: 403 });
    }
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      return NextResponse.json({ error: 'Cannot cancel this booking' }, { status: 400 });
    }
  }

  // Admin can update any field
  const updateData: Record<string, unknown> = {};

  if (body.status) updateData.status = body.status;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.totalPrice !== undefined) updateData.totalPrice = body.totalPrice;
  if (body.startDate) updateData.startDate = new Date(body.startDate);
  if (body.endDate) updateData.endDate = new Date(body.endDate);
  if (body.arrivalTime !== undefined) updateData.arrivalTime = body.arrivalTime;

  const updated = await prisma.booking.update({
    where: { id },
    data: updateData,
    include: { client: true, bookingPets: { include: { pet: true } } },
  });

  const locale = updated.client.language ?? 'fr';
  const petNames = updated.bookingPets.map((bp) => bp.pet.name).join(', ');

  // Send notifications based on status change
  if (body.status === 'CONFIRMED') {
    const dates = updated.startDate
      ? `${formatDateShort(updated.startDate, locale)}${updated.endDate ? ` – ${formatDateShort(updated.endDate, locale)}` : ''}`
      : '';

    await createBookingValidationNotification(updated.clientId, id, petNames, dates);

    const serviceLabel = updated.serviceType === 'BOARDING'
      ? (locale === 'fr' ? 'Pension' : 'Boarding')
      : (locale === 'fr' ? 'Taxi' : 'Taxi');

    const { subject, html } = getEmailTemplate('booking_validated', {
      clientName: updated.client.name,
      bookingRef: id,
      service: serviceLabel,
      petName: petNames,
      dates,
    }, locale);

    await sendEmail({ to: updated.client.email, subject, html });

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_CONFIRMED,
      entityType: 'Booking',
      entityId: id,
    });
  }

  if (body.status === 'CANCELLED') {
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_CANCELLED,
      entityType: 'Booking',
      entityId: id,
    });
  }

  if (body.status === 'COMPLETED') {
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_COMPLETED,
      entityType: 'Booking',
      entityId: id,
    });
  }

  if (body.status === 'CANCELLED' && session.user.role === 'ADMIN') {
    await createBookingRefusalNotification(updated.clientId, id, body.reason);
    const { subject, html } = getEmailTemplate('booking_refused', {
      clientName: updated.client.name,
      bookingRef: id,
      reason: body.reason ?? '',
    }, locale);
    await sendEmail({ to: updated.client.email, subject, html });
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BOOKING_REJECTED,
      entityType: 'Booking',
      entityId: id,
      details: { reason: body.reason },
    });
  }

  // Update grooming add-on if admin changes it
  if (session.user.role === 'ADMIN' && body.includeGrooming !== undefined) {
    await prisma.boardingDetail.upsert({
      where: { bookingId: id },
      update: {
        includeGrooming: body.includeGrooming,
        groomingSize: body.groomingSize,
        groomingPrice: body.groomingPrice ?? 0,
      },
      create: {
        bookingId: id,
        includeGrooming: body.includeGrooming,
        groomingSize: body.groomingSize,
        groomingPrice: body.groomingPrice ?? 0,
        pricePerNight: body.pricePerNight ?? 200,
      },
    });
  }

  return NextResponse.json(updated);
}
