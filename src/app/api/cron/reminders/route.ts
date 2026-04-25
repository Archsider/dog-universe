import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { sendSMS, sendAdminSMS, petPossessive } from '@/lib/sms';

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
  let skipped = 0;
  const errors: string[] = [];

  // Marqueur de jour : permet de détecter une notif déjà créée aujourd'hui
  // pour la même booking (anti double-fire du cron Vercel).
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // ── Start reminders (CONFIRMED bookings starting tomorrow) ────────────────
  const startBookings = await prisma.booking.findMany({
    where: {
      serviceType: 'BOARDING',
      status: 'CONFIRMED',
      startDate: { gte: rangeStart, lte: rangeEnd },
    },
    include: {
      client: { select: { name: true, email: true, language: true, phone: true } },
      bookingPets: { include: { pet: { select: { name: true, gender: true } } } },
    },
  });

  for (const booking of startBookings) {
    try {
      // Déduplication : si une notif STAY_REMINDER pour cette booking
      // a déjà été créée aujourd'hui, on saute (évite double envoi sur retry cron).
      const alreadySent = await prisma.notification.findFirst({
        where: {
          userId: booking.clientId,
          type: 'STAY_REMINDER',
          metadata: { contains: `"bookingId":"${booking.id}"` },
          createdAt: { gte: todayStart },
        },
        select: { id: true },
      });
      if (alreadySent) { skipped++; continue; }

      const locale = booking.client.language ?? 'fr';
      const pets = booking.bookingPets.map(bp => bp.pet);
      const petNames = pets.map(p => p.name).join(' et ');
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
        pets,
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

      // SMS J-1 arrivée — accord genre/pluriel
      const clientName = booking.client.name ?? booking.client.email;
      const firstName = clientName.split(' ')[0] || clientName;
      await sendSMS(
        booking.client.phone,
        `Bonjour ${firstName} ! Nous avons hâte d'accueillir ${petNames} demain. N'oubliez pas ${petPossessive(pets)} affaires. À demain ! — Dog Universe 🐾`,
      );
      await sendAdminSMS(`📋 J-1 arrivée demain : ${petNames} de ${clientName}.`);

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
      client: { select: { name: true, email: true, language: true, phone: true } },
      bookingPets: { include: { pet: { select: { name: true, gender: true } } } },
    },
  });

  for (const booking of endBookings) {
    try {
      // Déduplication : skip si une notif STAY_END_REMINDER existe déjà aujourd'hui.
      const alreadySent = await prisma.notification.findFirst({
        where: {
          userId: booking.clientId,
          type: 'STAY_END_REMINDER',
          metadata: { contains: `"bookingId":"${booking.id}"` },
          createdAt: { gte: todayStart },
        },
        select: { id: true },
      });
      if (alreadySent) { skipped++; continue; }

      const locale = booking.client.language ?? 'fr';
      const pets = booking.bookingPets.map(bp => bp.pet);
      const petNames = pets.map(p => p.name).join(' et ');
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
        pets,
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

      // SMS J-1 départ — accord genre/pluriel
      const clientName = booking.client.name ?? booking.client.email;
      const firstName = clientName.split(' ')[0] || clientName;
      const isPlural = pets.length > 1;
      await sendSMS(
        booking.client.phone,
        `Bonjour ${firstName} ! ${petNames} rentre${isPlural ? 'nt' : ''} demain à la maison. Ce fut un bonheur de ${isPlural ? 'les' : "l'"} avoir. À très bientôt ! — Dog Universe 🐾`,
      );
      await sendAdminSMS(`📋 J-1 départ demain : ${petNames} de ${clientName}.`);

      sent++;
    } catch (err) {
      errors.push(`end:${booking.id}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    startReminders: startBookings.length,
    endReminders: endBookings.length,
    errors: errors.length ? errors : undefined,
  });
}
