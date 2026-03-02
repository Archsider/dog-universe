import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBookingValidationNotification, createBookingRefusalNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { formatDateShort } from '@/lib/utils';

const ALLOWED_STATUSES = ['CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'IN_PROGRESS'];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ids, status } = await request.json();

  if (!Array.isArray(ids) || ids.length === 0 || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const bookings = await prisma.booking.findMany({
    where: { id: { in: ids } },
    include: { client: true, bookingPets: { include: { pet: true } } },
  });

  const results = await Promise.allSettled(
    bookings.map(async booking => {
      await prisma.booking.update({ where: { id: booking.id }, data: { status } });

      const locale = booking.client.language ?? 'fr';
      const petNames = booking.bookingPets.map(bp => bp.pet.name).join(', ');

      if (status === 'CONFIRMED') {
        const dates = `${formatDateShort(booking.startDate, locale)}${booking.endDate ? ` – ${formatDateShort(booking.endDate, locale)}` : ''}`;
        await createBookingValidationNotification(booking.clientId, booking.id, petNames, dates);
        const { subject, html } = getEmailTemplate('booking_validated', {
          clientName: booking.client.name, bookingRef: booking.id,
          service: booking.serviceType === 'BOARDING' ? (locale === 'fr' ? 'Pension' : 'Boarding') : 'Taxi',
          petName: petNames, dates,
        }, locale);
        await sendEmail({ to: booking.client.email, subject, html });
      }

      if (status === 'REJECTED' || status === 'CANCELLED') {
        await createBookingRefusalNotification(booking.clientId, booking.id);
        const { subject, html } = getEmailTemplate('booking_refused', {
          clientName: booking.client.name, bookingRef: booking.id, reason: '',
        }, locale);
        await sendEmail({ to: booking.client.email, subject, html });
      }

      const actionMap: Record<string, string> = {
        CONFIRMED: LOG_ACTIONS.BOOKING_CONFIRMED,
        REJECTED: LOG_ACTIONS.BOOKING_REJECTED,
        CANCELLED: LOG_ACTIONS.BOOKING_CANCELLED,
        COMPLETED: LOG_ACTIONS.BOOKING_COMPLETED,
      };
      await logAction({
        userId: session.user.id,
        action: actionMap[status] ?? LOG_ACTIONS.BOOKING_CONFIRMED,
        entityType: 'Booking',
        entityId: booking.id,
        details: { bulkStatus: status },
      });
    })
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  return NextResponse.json({ updated: succeeded, total: ids.length });
}
