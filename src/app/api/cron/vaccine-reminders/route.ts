import { parseMetadata } from '@/lib/notifications/metadata';
import { prisma } from '@/lib/prisma';
import { notDeleted, contactable } from '@/lib/prisma-soft';
import { createNotification } from '@/lib/notifications';
import { enqueueEmail } from '@/lib/queues';
import { getEmailTemplate } from '@/lib/email';
import { getCasaStartOfDay } from '@/lib/timezone';
import { defineCron } from '@/lib/cron-runner';

export const maxDuration = 60;

// How far ahead we look, and how long we suppress a repeat reminder for the
// same vaccination. A vaccine's nextDueDate is typically annual, so a 60-day
// dedup window guarantees exactly one nudge per renewal cycle (and never
// blocks next year's reminder).
const WINDOW_DAYS = 30;
const DEDUP_DAYS = 60;
const APP_ORIGIN = 'https://doguniverse.ma';

/**
 * GET /api/cron/vaccine-reminders
 * Daily. Finds CONFIRMED vaccinations whose nextDueDate falls within the next
 * 30 days and notifies the (non-walk-in, contactable) owner once per cycle —
 * in-app notification + bilingual email. Health touch + keeps records current
 * for future stays.
 */
export const GET = defineCron({
  name: 'vaccine-reminders',
  period: 'daily',
  fn: async ({ now }) => {
    const today = getCasaStartOfDay(now);
    const horizon = new Date(today.getTime() + WINDOW_DAYS * 86_400_000);

    const vaccinations = await prisma.vaccination.findMany({
      where: {
        status: 'CONFIRMED',
        nextDueDate: { gte: today, lte: horizon },
        // Pet not soft-deleted; owner contactable (not deleted/anonymized) and
        // not a walk-in (walk-ins have no portal account to notify).
        pet: notDeleted({ owner: { ...contactable(), isWalkIn: false } }),
      },
      select: {
        id: true,
        vaccineType: true,
        nextDueDate: true,
        pet: {
          select: {
            id: true,
            name: true,
            owner: { select: { id: true, name: true, email: true, language: true } },
          },
        },
      },
      take: 500,
    });

    // Dedup: skip vaccinations already reminded within DEDUP_DAYS.
    const dedupSince = new Date(now.getTime() - DEDUP_DAYS * 86_400_000);
    const priorNotifs = await prisma.notification.findMany({
      where: { type: 'VACCINE_REMINDER', createdAt: { gte: dedupSince } },
      select: { metadata: true },
    });
    const alreadyReminded = new Set<string>();
    for (const n of priorNotifs) {
      try {
        const meta = parseMetadata(n.metadata);
        if (typeof meta.vaccinationId === 'string') alreadyReminded.add(meta.vaccinationId);
      } catch {
        /* ignore malformed metadata */
      }
    }

    let sent = 0;
    let skipped = 0;

    await Promise.all(
      vaccinations.map(async (v) => {
        if (!v.pet || !v.pet.owner || !v.nextDueDate) {
          skipped++;
          return;
        }
        if (alreadyReminded.has(v.id)) {
          skipped++;
          return;
        }

        const owner = v.pet.owner;
        const locale = owner.language ?? 'fr';
        const intlLocale = locale === 'en' ? 'en-GB' : locale === 'ar' ? 'ar-MA' : 'fr-FR';
        const dueLong = v.nextDueDate.toLocaleDateString(intlLocale, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Africa/Casablanca',
        });
        const vaccineLabel = v.vaccineType?.trim() || '';
        const vaccineParen = vaccineLabel ? ` (${vaccineLabel})` : '';

        try {
          const ops: Promise<unknown>[] = [
            createNotification({
              userId: owner.id,
              type: 'VACCINE_REMINDER',
              titleFr: `Rappel vaccin — ${v.pet.name}`,
              titleEn: `Vaccine reminder — ${v.pet.name}`,
              messageFr: `Le vaccin${vaccineParen} de ${v.pet.name} arrive à échéance le ${dueLong}. Pensez à le renouveler.`,
              messageEn: `${v.pet.name}'s vaccine${vaccineParen} is due on ${dueLong}. Remember to renew it.`,
              metadata: { vaccinationId: v.id, petId: v.pet.id },
            }),
          ];

          if (owner.email) {
            const { subject, html } = getEmailTemplate(
              'vaccine_reminder',
              {
                clientFirstName: (owner.name ?? '').split(' ')[0] ?? '',
                petName: v.pet.name,
                vaccineType: vaccineLabel,
                dueDateLong: dueLong,
                petUrl: `${APP_ORIGIN}/${locale}/client/pets/${v.pet.id}`,
              },
              locale,
            );
            ops.push(enqueueEmail({ to: owner.email, subject, html }, `vaccine-reminder:${v.id}`));
          }

          await Promise.allSettled(ops);
          sent++;
        } catch {
          skipped++;
        }
      }),
    );

    return { sent, skipped, scanned: vaccinations.length };
  },
});
