import { parseMetadata } from '@/lib/notifications/metadata';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { createNotification } from '@/lib/notifications';
import { enqueueEmail } from '@/lib/queues';
import { getEmailTemplate } from '@/lib/email';
import { getCasaStartOfDay } from '@/lib/timezone';
import { defineCron } from '@/lib/cron-runner';

export const maxDuration = 60;

/**
 * GET /api/cron/review-requests
 * Exécuté quotidiennement. Cherche les réservations COMPLETED dans les 24 dernières heures
 * sans avis existant → envoie une notification REVIEW_REQUEST + email bilingue.
 */
export const GET = defineCron({
  name: 'review-requests',
  period: 'daily',
  fn: async ({ now }) => {
    const since = new Date(now.getTime() - 24 * 3600 * 1000);

    // Bookings COMPLETED dans les 24h sans avis existant
    const completedBookings = await prisma.booking.findMany({
      where: {
        ...notDeleted(),
        status: 'COMPLETED',
        updatedAt: { gte: since },
        review: null, // pas encore d'avis
      },
      include: {
        client: { select: { id: true, name: true, email: true, language: true } },
        bookingPets: { include: { pet: { select: { name: true } } } },
      },
      take: 200,
    });

    // Déduplication : on ne veut pas envoyer deux fois si la notif existe déjà
    // aujourd'hui — fenêtre alignée sur l'heure locale Casablanca.
    const todayStart = getCasaStartOfDay(now);
    const existingNotifs = await prisma.notification.findMany({
      where: {
        type: 'REVIEW_REQUEST',
        createdAt: { gte: todayStart },
      },
      select: { metadata: true },
    });
    const alreadyNotifiedBookingIds = new Set<string>();
    for (const n of existingNotifs) {
      try {
        const meta = parseMetadata(n.metadata);
        if (typeof meta.bookingId === 'string') alreadyNotifiedBookingIds.add(meta.bookingId);
      } catch { /* ignore */ }
    }

    let sent = 0;
    let skipped = 0;

    await Promise.all(completedBookings.map(async (booking) => {
      if (alreadyNotifiedBookingIds.has(booking.id)) { skipped++; return; }

      const locale = booking.client.language ?? 'fr';
      const petNames = booking.bookingPets.map(bp => bp.pet.name).join(' et ');
      const bookingRef = booking.id.slice(0, 8).toUpperCase();
      const reviewUrl = `/${locale}/client/bookings/${booking.id}`;

      try {
        const ops: Promise<unknown>[] = [
          createNotification({
            userId: booking.clientId,
            type: 'REVIEW_REQUEST',
            titleFr: 'Donnez votre avis !',
            titleEn: 'Share your feedback!',
            messageFr: `Comment s'est passé le séjour de ${petNames} ? Partagez votre expérience.`,
            messageEn: `How was ${petNames}'s stay? Share your experience.`,
            metadata: { bookingId: booking.id },
          }),
        ];

        // Email bilingue simple
        const { subject, html } = getEmailTemplate(
          'review_request',
          {
            clientName: booking.client.name ?? booking.client.email,
            petName: petNames,
            bookingRef,
            reviewUrl: `https://doguniverse.ma${reviewUrl}`,
          },
          locale,
          booking.bookingPets.map(bp => bp.pet),
        );
        ops.push(enqueueEmail(
          { to: booking.client.email, subject, html },
          `review-request:${booking.id}`,
        ));

        await Promise.allSettled(ops);
        sent++;
      } catch {
        skipped++;
      }
    }));

    return { sent, skipped };
  },
});
