// GET /api/cron/pre-stay-briefing
//
// Runs daily at 10 h Casa.  For every CONFIRMED boarding starting in the
// next 24–48 h that doesn't already have a PreStayBriefing row, creates
// the row + sends the invitation email + in-app notification.
//
// Source : Feature #16 (audit world 2026-05-19) — invite the owner J-2 to
// pre-fill what we need to know about their pet.

import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { defineCron } from '@/lib/cron-runner';
import { getEmailTemplate } from '@/lib/email';
import { enqueueEmail } from '@/lib/queues';
import { createNotification } from '@/lib/notifications';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

function ymdLong(d: Date, isFr: boolean): string {
  return d.toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export const GET = defineCron({
  name: 'pre-stay-briefing',
  period: 'daily',
  fn: async ({ now }) => {
    // Bookings whose startDate lands between H+24 and H+48 from now (today's
    // cron tick).  Stretching to ~30 hours either side gives us a safe window
    // even if a tick gets delayed.
    const lowerBound = new Date(now.getTime() + 24 * 3600 * 1000);
    const upperBound = new Date(now.getTime() + 60 * 3600 * 1000);

    const bookings = await prisma.booking.findMany({
      where: {
        ...notDeleted(),
        status: 'CONFIRMED',
        serviceType: 'BOARDING',
        startDate: { gte: lowerBound, lte: upperBound },
        preStayBriefing: null, // not already invited
      },
      select: {
        id: true,
        startDate: true,
        client: {
          select: {
            id: true, name: true, firstName: true,
            email: true, language: true, isWalkIn: true,
          },
        },
        bookingPets: {
          select: { pet: { select: { name: true, species: true, gender: true } } },
          take: 5,
        },
      },
    });

    let created = 0;
    let skipped = 0;

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || 'https://doguniverse.ma').replace(/\/$/, '');

    for (const booking of bookings) {
      // Walk-in clients with synthetic emails can't be reached — skip but
      // still create the row so the admin can see "no briefing came in"
      // pattern uniformly.
      const hasRealEmail = !!(booking.client.email
        && !booking.client.email.endsWith('@dog-universe.local')
        && !booking.client.isWalkIn);

      try {
        await prisma.preStayBriefing.create({
          data: {
            bookingId: booking.id,
          },
        });
        created++;
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
          skipped++;
          continue;
        }
        throw err;
      }

      const petName = booking.bookingPets[0]?.pet?.name ?? '';
      const locale = (booking.client.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
      const isFr = locale === 'fr';
      const briefingUrl = `${baseUrl}/${locale}/client/bookings/${booking.id}/briefing`;

      // In-app notification (client) — always created, even when no email.
      try {
        await createNotification({
          userId: booking.client.id,
          type: 'PRE_STAY_BRIEFING_REQUEST',
          titleFr: petName ? `🐾 Préparons le séjour de ${petName}` : '🐾 Préparons le séjour',
          titleEn: petName ? `🐾 Let's prepare ${petName}'s stay` : `🐾 Let's prepare the stay`,
          messageFr: `Quelques infos pour qu'on soit prêts à l'accueillir : alimentation, doudou, peurs, routine.`,
          messageEn: `A few notes so we're ready: food, toys, fears, routine.`,
          metadata: { bookingId: booking.id },
        });
      } catch (err) {
        logger.error('pre-stay-briefing', 'NOTIF_FAILED', {
          bookingId: booking.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (hasRealEmail && booking.client.email) {
        try {
          const tpl = getEmailTemplate(
            'pre_stay_briefing',
            {
              clientFirstName: booking.client.firstName ?? '',
              petName,
              startDateLong: ymdLong(booking.startDate, isFr),
              briefingUrl,
            },
            locale,
          );
          await enqueueEmail({
            to: booking.client.email,
            subject: tpl.subject,
            html: tpl.html,
          });
        } catch (err) {
          logger.error('pre-stay-briefing', 'EMAIL_ENQUEUE_FAILED', {
            bookingId: booking.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return {
      windowFrom: lowerBound.toISOString(),
      windowTo: upperBound.toISOString(),
      candidates: bookings.length,
      briefingsCreated: created,
      alreadyExisting: skipped,
    };
  },
});
