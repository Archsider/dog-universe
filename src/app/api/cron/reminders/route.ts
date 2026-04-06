import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { createNotification } from '@/lib/notifications';

/**
 * POST /api/cron/reminders
 * Called daily by Vercel Cron (see vercel.json).
 * Sends a J-2 reminder email to clients whose boarding starts in 2 days.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRON_SECRET is not configured — cron endpoint is unprotected');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // Target: bookings whose startDate falls in [now+2d 00:00, now+2d 23:59]
  const dayAfterTomorrow = new Date(now);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  const rangeStart = new Date(dayAfterTomorrow);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(dayAfterTomorrow);
  rangeEnd.setHours(23, 59, 59, 999);

  const bookings = await prisma.booking.findMany({
    where: {
      serviceType: 'BOARDING',
      status: 'CONFIRMED',
      startDate: { gte: rangeStart, lte: rangeEnd },
    },
    include: {
      client: { select: { name: true, email: true, language: true } },
      bookingPets: { include: { pet: { select: { name: true } } } },
    },
  });

  let sent = 0;
  const errors: string[] = [];

  for (const booking of bookings) {
    try {
      const locale = booking.client.language ?? 'fr';
      const petNames = booking.bookingPets.map(bp => bp.pet.name).join(', ');
      const dateFormatOpts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
      const startDateFr = booking.startDate.toLocaleDateString('fr-FR', dateFormatOpts);
      const startDateEn = booking.startDate.toLocaleDateString('en-US', dateFormatOpts);
      // For email, use the client's preferred locale
      const startDate = locale === 'fr' ? startDateFr : startDateEn;

      const { subject, html } = getEmailTemplate(
        'booking_reminder',
        {
          clientName: booking.client.name ?? booking.client.email,
          bookingRef: booking.id.slice(0, 8).toUpperCase(),
          petName: petNames,
          startDate,
          service: locale === 'fr' ? 'Pension' : 'Boarding',
        },
        locale,
      );

      await sendEmail({ to: booking.client.email, subject, html });

      // Also create an in-app notification for the reminder
      await createNotification({
        userId: booking.clientId,
        type: 'STAY_REMINDER',
        titleFr: 'Rappel de séjour',
        titleEn: 'Stay reminder',
        messageFr: `Le séjour de ${petNames} commence dans 2 jours (${startDateFr}).`,
        messageEn: `${petNames}'s stay starts in 2 days (${startDateEn}).`,
        metadata: { bookingId: booking.id },
      });

      sent++;
    } catch (err) {
      errors.push(`${booking.id}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    total: bookings.length,
    errors: errors.length ? errors : undefined,
  });
}
