import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { createNotification } from '@/lib/notifications';

/**
 * POST /api/cron/reminders
 * Called daily by Vercel Cron (see vercel.json).
 * Sends J-1 reminders:
 *   - Start reminders: clients + admins notified the day before boarding check-in
 *   - End reminders: clients + admins notified the day before boarding check-out
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
  const dateFormatOpts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };

  // Target: tomorrow's date range
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const rangeStart = new Date(tomorrow);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(tomorrow);
  rangeEnd.setHours(23, 59, 59, 999);

  // Fetch all admins for admin notifications
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
    select: { id: true, email: true, language: true },
  });

  let sent = 0;
  const errors: string[] = [];

  // ── Start reminders (CONFIRMED bookings starting tomorrow) ────────────────
  const startBookings = await prisma.booking.findMany({
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

  for (const booking of startBookings) {
    try {
      const locale = booking.client.language ?? 'fr';
      const petNames = booking.bookingPets.map(bp => bp.pet.name).join(', ');
      const startDateFr = booking.startDate.toLocaleDateString('fr-FR', dateFormatOpts);
      const startDateEn = booking.startDate.toLocaleDateString('en-US', dateFormatOpts);
      const startDate = locale === 'fr' ? startDateFr : startDateEn;
      const bookingRef = booking.id.slice(0, 8).toUpperCase();

      // Client email
      const { subject, html } = getEmailTemplate(
        'booking_reminder',
        {
          clientName: booking.client.name ?? booking.client.email,
          bookingRef,
          petName: petNames,
          startDate,
          service: locale === 'fr' ? 'Pension' : 'Boarding',
        },
        locale,
      );
      await sendEmail({ to: booking.client.email, subject, html });

      // Client in-app notification
      await createNotification({
        userId: booking.clientId,
        type: 'STAY_REMINDER',
        titleFr: 'Rappel : séjour demain',
        titleEn: 'Reminder: stay tomorrow',
        messageFr: `Le séjour de ${petNames} commence demain (${startDateFr}).`,
        messageEn: `${petNames}'s stay starts tomorrow (${startDateEn}).`,
        metadata: { bookingId: booking.id },
      });

      // Admin notifications (in-app + email)
      for (const admin of admins) {
        const adminLocale = admin.language ?? 'fr';
        await createNotification({
          userId: admin.id,
          type: 'STAY_REMINDER',
          titleFr: `Arrivée demain — ${petNames}`,
          titleEn: `Check-in tomorrow — ${petNames}`,
          messageFr: `${booking.client.name} arrive demain avec ${petNames} (réf. ${bookingRef}).`,
          messageEn: `${booking.client.name} checks in tomorrow with ${petNames} (ref. ${bookingRef}).`,
          metadata: { bookingId: booking.id },
        });
        const { subject: aSubject, html: aHtml } = getEmailTemplate(
          'admin_stay_reminder',
          {
            clientName: booking.client.name ?? booking.client.email,
            petName: petNames,
            bookingRef,
            date: adminLocale === 'fr' ? startDateFr : startDateEn,
            reminderType: 'start',
          },
          adminLocale,
        );
        await sendEmail({ to: admin.email, subject: aSubject, html: aHtml });
      }

      sent++;
    } catch (err) {
      errors.push(`start:${booking.id}: ${String(err)}`);
    }
  }

  // ── End reminders (IN_PROGRESS or CONFIRMED bookings ending tomorrow) ─────
  const endBookings = await prisma.booking.findMany({
    where: {
      serviceType: 'BOARDING',
      status: { in: ['IN_PROGRESS', 'CONFIRMED'] },
      endDate: { gte: rangeStart, lte: rangeEnd },
    },
    include: {
      client: { select: { name: true, email: true, language: true } },
      bookingPets: { include: { pet: { select: { name: true } } } },
    },
  });

  for (const booking of endBookings) {
    try {
      const locale = booking.client.language ?? 'fr';
      const petNames = booking.bookingPets.map(bp => bp.pet.name).join(', ');
      const endDateFr = booking.endDate!.toLocaleDateString('fr-FR', dateFormatOpts);
      const endDateEn = booking.endDate!.toLocaleDateString('en-US', dateFormatOpts);
      const endDate = locale === 'fr' ? endDateFr : endDateEn;
      const bookingRef = booking.id.slice(0, 8).toUpperCase();

      // Client email
      const { subject, html } = getEmailTemplate(
        'stay_end_reminder',
        {
          clientName: booking.client.name ?? booking.client.email,
          bookingRef,
          petName: petNames,
          endDate,
        },
        locale,
      );
      await sendEmail({ to: booking.client.email, subject, html });

      // Client in-app notification
      await createNotification({
        userId: booking.clientId,
        type: 'STAY_END_REMINDER',
        titleFr: 'Fin de séjour demain',
        titleEn: 'Stay ending tomorrow',
        messageFr: `Le séjour de ${petNames} se termine demain (${endDateFr}). Pensez à prévoir votre venue.`,
        messageEn: `${petNames}'s stay ends tomorrow (${endDateEn}). Please plan your pick-up.`,
        metadata: { bookingId: booking.id },
      });

      // Admin notifications (in-app + email)
      for (const admin of admins) {
        const adminLocale = admin.language ?? 'fr';
        await createNotification({
          userId: admin.id,
          type: 'STAY_END_REMINDER',
          titleFr: `Départ demain — ${petNames}`,
          titleEn: `Check-out tomorrow — ${petNames}`,
          messageFr: `${booking.client.name} récupère ${petNames} demain (réf. ${bookingRef}).`,
          messageEn: `${booking.client.name} picks up ${petNames} tomorrow (ref. ${bookingRef}).`,
          metadata: { bookingId: booking.id },
        });
        const { subject: aSubject, html: aHtml } = getEmailTemplate(
          'admin_stay_reminder',
          {
            clientName: booking.client.name ?? booking.client.email,
            petName: petNames,
            bookingRef,
            date: adminLocale === 'fr' ? endDateFr : endDateEn,
            reminderType: 'end',
          },
          adminLocale,
        );
        await sendEmail({ to: admin.email, subject: aSubject, html: aHtml });
      }

      sent++;
    } catch (err) {
      errors.push(`end:${booking.id}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    startReminders: startBookings.length,
    endReminders: endBookings.length,
    errors: errors.length ? errors : undefined,
  });
}
