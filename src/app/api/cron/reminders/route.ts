import { parseMetadata } from '@/lib/notifications/metadata';
import { prisma } from '@/lib/prisma';
import { log } from '@/lib/logger';
import { getEmailTemplate } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { NOTIFICATION_MESSAGES } from '@/lib/notification-messages';
import { petPossessive } from '@/lib/sms';
import { enqueueEmail, enqueueSms } from '@/lib/queues';
import { getCasaStartOfDay, getCasaEndOfDay } from '@/lib/timezone';
import { defineCron } from '@/lib/cron-runner';

export const maxDuration = 60;

/**
 * GET /api/cron/reminders
 * Called daily by Vercel Cron (see vercel.json).
 * Sends J-1 reminders:
 *   - Start reminders: clients + admins notified the day before boarding check-in
 *   - End reminders: clients + admins notified the day before boarding check-out
 */
export const GET = defineCron({
  name: 'reminders',
  period: 'daily',
  fn: async ({ now }) => {
    const dateFormatOpts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };

    // Target: tomorrow's date range *in Casablanca local time*. Vercel runs in
    // UTC — a naive `setHours(0,0,0,0)` would compute UTC midnight, so the cron
    // would consider 00:00–01:00 Casablanca as part of "today", missing the
    // bookings recorded between midnight and 1AM local.
    const tomorrowSeed = new Date(now);
    tomorrowSeed.setUTCDate(tomorrowSeed.getUTCDate() + 1);
    const rangeStart = getCasaStartOfDay(tomorrowSeed);
    const rangeEnd = getCasaEndOfDay(tomorrowSeed);

    // Fetch all admins for admin notifications
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPERADMIN'] }, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      select: { id: true, email: true, language: true },
      take: 100,
    });

    let sent = 0;
    let skipped = 0;
    let failures = 0;
    const errors: string[] = [];

    // Marqueur de jour : permet de détecter une notif déjà créée aujourd'hui
    // pour la même booking (anti double-fire du cron Vercel). Borné en heure
    // Casablanca pour rester cohérent avec la fenêtre `rangeStart`/`rangeEnd`.
    const todayStart = getCasaStartOfDay(now);

    // ── Start reminders (CONFIRMED bookings starting tomorrow) ────────────────
    const startBookings = await prisma.booking.findMany({
      where: {
        serviceType: 'BOARDING',
        status: 'CONFIRMED',
        startDate: { gte: rangeStart, lte: rangeEnd },
        deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
      },
      include: {
        client: { select: { name: true, email: true, language: true, phone: true } },
        bookingPets: { include: { pet: { select: { name: true, gender: true } } } },
      },
      take: 500,
    });

    // Batch dedup: load all STAY_REMINDER notifications sent today for these clients
    // in a single query, then check in-memory — avoids N individual findFirst calls.
    const startClientIds = startBookings.map(b => b.clientId);
    const existingStartReminders = await prisma.notification.findMany({
      where: {
        userId: { in: startClientIds },
        type: 'STAY_REMINDER',
        createdAt: { gte: todayStart },
      },
      select: { metadata: true },
      take: 1000,
    });
    const notifiedStartBookingIds = new Set<string>();
    for (const n of existingStartReminders) {
      try {
        const meta = parseMetadata(n.metadata);
        if (typeof meta.bookingId === 'string') notifiedStartBookingIds.add(meta.bookingId);
      } catch { /* ignore malformed metadata */ }
    }

    await Promise.all(startBookings.map(async (booking) => {
      try {
        // Déduplication : si une notif STAY_REMINDER pour cette booking
        // a déjà été créée aujourd'hui, on saute (évite double envoi sur retry cron).
        if (notifiedStartBookingIds.has(booking.id)) { skipped++; return; }

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

        // Client in-app notification + email + SMS — fire in parallel
        const clientName = booking.client.name ?? booking.client.email;
        const firstName = clientName.split(' ')[0] || clientName;
        const clientOps: Promise<unknown>[] = [
          enqueueEmail({ to: booking.client.email, subject, html }, `reminder:start:${booking.id}:client-email`),
          createNotification({
            userId: booking.clientId,
            type: 'STAY_REMINDER',
            titleFr: 'Rappel : séjour demain',
            titleEn: 'Reminder: stay tomorrow',
            messageFr: `Le séjour de ${petNames} commence demain (${startDateFr}).`,
            messageEn: `${petNames}'s stay starts tomorrow (${startDateEn}).`,
            metadata: { bookingId: booking.id },
          }),
          enqueueSms(
            {
              to: booking.client.phone,
              message: `Bonjour ${firstName} ! Nous avons hâte d'accueillir ${petNames} demain. N'oubliez pas ${petPossessive(pets)} affaires. À demain ! — Dog Universe 🐾`,
            },
            `reminder:start:${booking.id}:client-sms`,
          ),
          enqueueSms(
            { to: 'ADMIN', message: `📋 J-1 arrivée demain : ${petNames} de ${clientName}.` },
            `reminder:start:${booking.id}:admin-sms`,
          ),
        ];

        // Admin notifications (in-app + email) — parallel per admin
        for (const admin of admins) {
          const adminLocale = admin.language ?? 'fr';
          clientOps.push(createNotification({
            userId: admin.id,
            type: 'STAY_REMINDER',
            titleFr: `Arrivée demain — ${petNames}`,
            titleEn: `Check-in tomorrow — ${petNames}`,
            messageFr: `${booking.client.name} arrive demain avec ${petNames} (réf. ${bookingRef}).`,
            messageEn: `${booking.client.name} checks in tomorrow with ${petNames} (ref. ${bookingRef}).`,
            metadata: { bookingId: booking.id },
          }));
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
          clientOps.push(enqueueEmail(
            { to: admin.email, subject: aSubject, html: aHtml },
            `reminder:start:${booking.id}:admin-email:${admin.id}`,
          ));
        }

        const settled = await Promise.allSettled(clientOps);
        for (const s of settled) if (s.status === 'rejected') failures++;
        sent++;
      } catch (err) {
        errors.push(`start:${booking.id}: ${String(err)}`);
      }
    }));

    // ── End reminders (IN_PROGRESS or CONFIRMED bookings ending tomorrow) ─────
    const endBookings = await prisma.booking.findMany({
      where: {
        serviceType: 'BOARDING',
        status: { in: ['IN_PROGRESS', 'CONFIRMED'] },
        endDate: { gte: rangeStart, lte: rangeEnd },
        deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
      },
      include: {
        client: { select: { name: true, firstName: true, email: true, language: true, phone: true } },
        bookingPets: { include: { pet: { select: { name: true, gender: true } } } },
        taxiDetail: { select: { id: true } }, // taxi standalone (PET_TAXI service)
        boardingDetail: { select: { taxiReturnEnabled: true } }, // taxi retour en addon d'un BOARDING
      },
      take: 500,
    });

    // Batch dedup: load all STAY_END_REMINDER notifications sent today for these clients
    // in a single query, then check in-memory — avoids N individual findFirst calls.
    const endClientIds = endBookings.map(b => b.clientId);
    const existingEndReminders = await prisma.notification.findMany({
      where: {
        userId: { in: endClientIds },
        type: 'STAY_END_REMINDER',
        createdAt: { gte: todayStart },
      },
      select: { metadata: true },
      take: 1000,
    });
    const notifiedEndBookingIds = new Set<string>();
    for (const n of existingEndReminders) {
      try {
        const meta = parseMetadata(n.metadata);
        if (typeof meta.bookingId === 'string') notifiedEndBookingIds.add(meta.bookingId);
      } catch { /* ignore malformed metadata */ }
    }

    await Promise.all(endBookings.map(async (booking) => {
      try {
        // Déduplication : skip si une notif STAY_END_REMINDER existe déjà aujourd'hui.
        if (notifiedEndBookingIds.has(booking.id)) { skipped++; return; }

        const locale = booking.client.language ?? 'fr';
        const pets = booking.bookingPets.map(bp => bp.pet);
        const petNames = pets.map(p => p.name).join(' et ');
        const endDateFr = booking.endDate!.toLocaleDateString('fr-FR', dateFormatOpts);
        const endDateEn = booking.endDate!.toLocaleDateString('en-US', dateFormatOpts);
        const endDate = locale === 'fr' ? endDateFr : endDateEn;
        const bookingRef = booking.id.slice(0, 8).toUpperCase();

        // hasTaxi détecte le taxi standalone (taxiDetail) OU l'addon taxi retour
        // sur un séjour pension (boardingDetail.taxiReturnEnabled). Pour le rappel
        // "fin de séjour", seul le retour compte — l'aller a déjà eu lieu.
        const hasTaxi =
          booking.taxiDetail != null ||
          booking.boardingDetail?.taxiReturnEnabled === true;
        const isPlural = pets.length > 1;

        // Gender resolution (le/la, reposé/reposée). Falls back to neutral form if unknown.
        const firstPet = pets[0];
        const isFemale = !isPlural && firstPet?.gender === 'FEMALE';
        const isMale = !isPlural && firstPet?.gender === 'MALE';
        const articleFr = isFemale ? 'la' : isMale ? 'le' : 'le/la';
        const reposeFr = isFemale ? 'reposée' : isMale ? 'reposé' : 'reposé(e)';
        const chouchoutFr = isFemale ? 'chouchoutée' : isMale ? 'chouchouté' : 'chouchouté(e)';
        const pretFr = isFemale ? 'prête' : isMale ? 'prêt' : 'prêt(e)';
        const ilElleFr = isPlural ? 'ils/elles' : isFemale ? 'elle' : isMale ? 'il' : 'il/elle';

        // Client email — taxi/no-taxi conditional rendered in the template.
        const { subject, html } = getEmailTemplate(
          'stay_end_reminder',
          {
            clientName: booking.client.firstName ?? booking.client.name ?? booking.client.email,
            bookingRef,
            petName: petNames,
            endDate,
            hasTaxi: hasTaxi ? '1' : '',
            articleFr,
            reposeFr,
            chouchoutFr,
            pretFr,
            ilElleFr,
          },
          locale,
          pets,
        );

        const clientName = booking.client.name ?? booking.client.email;
        const firstName = booking.client.firstName
          ?? clientName.split(' ')[0]
          ?? booking.client.email;

        // SMS body — FR / EN / AR with taxi conditional.
        let smsMessage: string;
        if (locale === 'ar') {
          smsMessage = hasTaxi
            ? `مرحباً ${firstName}، إقامة ${petNames} تقترب من نهايتها. غداً سنعيد ${isPlural ? 'هم' : 'ه/ها'} إلى المنزل — مرتاح${isFemale ? 'ة' : ''}، مدلل${isFemale ? 'ة' : ''}، وجاهز${isFemale ? 'ة' : ''} للقائكم. — Dog Universe 🐾`
            : `مرحباً ${firstName}، إقامة ${petNames} تقترب من نهايتها. غداً ${isPlural ? 'ينتظرونكم' : 'ينتظركم'} في الفندق. نراكم في الموعد. — Dog Universe 🐾`;
        } else if (locale === 'en') {
          smsMessage = hasTaxi
            ? `Hello ${firstName}, ${petNames}'s stay is coming to an end. Tomorrow we bring ${isPlural ? 'them' : 'them'} home — rested, pampered, and ready to be reunited with you. — Dog Universe 🐾`
            : `Hello ${firstName}, ${petNames}'s stay is coming to an end. Tomorrow ${isPlural ? 'they are' : 'they are'} waiting for you with eager paws. See you at the boarding for the reunion. — Dog Universe 🐾`;
        } else {
          smsMessage = hasTaxi
            ? `Bonjour ${firstName}, le séjour de ${petNames} touche à sa fin. Demain, nous vous ${articleFr} ramenons à la maison — ${reposeFr}, ${chouchoutFr}, et ${pretFr} à vous retrouver. — Dog Universe 🐾`
            : `Bonjour ${firstName}, le séjour de ${petNames} touche à sa fin. Demain, ${ilElleFr} vous attend${isPlural ? 'ent' : ''} les pattes impatientes. On se retrouve à la pension pour les retrouvailles. — Dog Universe 🐾`;
        }

        const ops: Promise<unknown>[] = [
          enqueueEmail({ to: booking.client.email, subject, html }, `reminder:end:${booking.id}:client-email`),
          createNotification({
            userId: booking.clientId,
            type: 'STAY_END_REMINDER',
            ...NOTIFICATION_MESSAGES.STAY_END_REMINDER({
              petName: petNames,
              endDateFr,
              endDateEn,
              hasTaxi: hasTaxi ? '1' : '',
              articleFr,
            }),
            metadata: { bookingId: booking.id, hasTaxi: hasTaxi ? '1' : '0' },
          }),
          enqueueSms(
            { to: booking.client.phone, message: smsMessage },
            `reminder:end:${booking.id}:client-sms`,
          ),
          enqueueSms(
            { to: 'ADMIN', message: `📋 J-1 départ demain : ${petNames} de ${clientName}.` },
            `reminder:end:${booking.id}:admin-sms`,
          ),
        ];

        for (const admin of admins) {
          const adminLocale = admin.language ?? 'fr';
          ops.push(createNotification({
            userId: admin.id,
            type: 'STAY_END_REMINDER',
            ...NOTIFICATION_MESSAGES.STAY_END_REMINDER_ADMIN({
              clientName: booking.client.name,
              petNames,
              bookingRef,
            }),
            metadata: { bookingId: booking.id },
          }));
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
          ops.push(enqueueEmail(
            { to: admin.email, subject: aSubject, html: aHtml },
            `reminder:end:${booking.id}:admin-email:${admin.id}`,
          ));
        }

        const settled = await Promise.allSettled(ops);
        for (const s of settled) if (s.status === 'rejected') failures++;
        sent++;
      } catch (err) {
        errors.push(`end:${booking.id}: ${String(err)}`);
      }
    }));

    if (errors.length) {
      await log('error', 'cron-reminders', 'Some reminders failed', { errors });
    }

    return {
      sent,
      skipped,
      failures,
      startReminders: startBookings.length,
      endReminders: endBookings.length,
      errors: errors.length ? errors : undefined,
    };
  },
});
