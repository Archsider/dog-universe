import { parseMetadata } from '@/lib/notifications/metadata';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { log } from '@/lib/logger';
import { getEmailTemplate } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { enqueueEmail } from '@/lib/queues';
import { generateWeeklyPetReport } from '@/lib/ai';
import { defineCron } from '@/lib/cron-runner';
import { isFeatureEnabled } from '@/lib/feature-flags';

export const maxDuration = 60;

// Safety bounds — the pension is in early-stage growth (Mehdi: app launched
// April 2026), so a single weekly run currently processes a handful of
// stays. These caps protect against runaway growth or an accidental data
// spike:
//
//   MAX_BOOKINGS_PER_RUN — hard ceiling on the booking query. Above ~500
//     concurrent boardings the cron would risk an OOM on the Lambda or
//     blow past the 60s timeout. Stays are queried oldest-first so even
//     if we hit the cap one week, older stays still get their report.
//
//   CONCURRENCY — process N bookings in parallel, sequentially across
//     batches. Each booking triggers 1 Anthropic API call + 1 email
//     enqueue + 1 notification create. Promise.all over hundreds would
//     burst the Anthropic rate limit and the Upstash REST quota. 5 keeps
//     the cron well under both limits even at the MAX cap.
const MAX_BOOKINGS_PER_RUN = 500;
const CONCURRENCY = 5;

/**
 * GET /api/cron/weekly-pet-report
 * Called weekly on Monday at 09:00 UTC by Vercel Cron (see vercel.json).
 *
 * For every BOARDING booking that has been IN_PROGRESS for at least 7 days,
 * generates a warm AI report (Claude Haiku) and sends it to the owner by
 * email + in-app notification.
 *
 * Idempotency:
 *   - Redis cron lock (weekly): prevents double-run on Vercel retries.
 *   - Per-booking dedup: skips if a WEEKLY_PET_REPORT notification was already
 *     created for this user+booking in the last 7 days.
 *
 * PII rule (RGPD): only ownerFirstName (first name only), petName, species,
 * anonymised note content, photosCount, and stayDaysCount are passed to the
 * Anthropic API. Never email / phone / address / DB IDs.
 */
export const GET = defineCron({
  name: 'weekly-pet-report',
  period: 'weekly',
  fn: async ({ now }) => {
    // Feature flag: `weekly-pet-report-enabled` is OFF by default — the
    // AI-generated weekly report is still maturing. Flip the flag ON
    // (via /admin/feature-flags) when we're ready to ship.
    // Anonymous context here because the cron has no user — only the
    // global `enabled` and `rolloutPercent` matter.
    const enabled = await isFeatureEnabled('weekly-pet-report-enabled', {});
    if (!enabled) {
      return { skipped: true, reason: 'feature_flag_off', sent: 0 };
    }

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://doguniverse.ma';

    // ── Find active BOARDING stays of at least 7 days ──────────────────────────
    // `take` bounds memory. `orderBy startDate asc` guarantees older stays
    // get their report first if we ever hit the cap (older stays have been
    // waiting longer for news — fairness matters).
    const activeBookings = await prisma.booking.findMany({
      where: notDeleted({
        status: 'IN_PROGRESS',
        startDate: { lte: sevenDaysAgo },
        serviceType: 'BOARDING',
      }),
      include: {
        client: { select: { id: true, name: true, email: true, language: true } },
        bookingPets: { include: { pet: { select: { name: true, species: true } } } },
      },
      take: MAX_BOOKINGS_PER_RUN,
      orderBy: { startDate: 'asc' },
    });

    if (activeBookings.length === 0) {
      return { sent: 0, skipped: 0 };
    }

    // ── Batch dedup: WEEKLY_PET_REPORT notifications from the last 7 days ──────
    const clientIds = activeBookings.map(b => b.clientId);
    const existingReports = await prisma.notification.findMany({
      where: {
        userId: { in: clientIds },
        type: 'WEEKLY_PET_REPORT',
        createdAt: { gte: sevenDaysAgo },
      },
      select: { userId: true, metadata: true },
    });
    // Map userId -> Set of bookingIds already reported this week
    const reportedMap = new Map<string, Set<string>>();
    for (const n of existingReports) {
      try {
        const meta = parseMetadata(n.metadata);
        if (typeof meta.bookingId === 'string') {
          if (!reportedMap.has(n.userId)) reportedMap.set(n.userId, new Set());
          reportedMap.get(n.userId)!.add(meta.bookingId);
        }
      } catch { /* ignore malformed metadata */ }
    }

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Chunked concurrency — each booking does 1 Anthropic call + 1 email
    // enqueue + 1 notification create. A flat Promise.all over the whole
    // list would burst the Anthropic rate limit and the Upstash REST
    // quota at scale. Process CONCURRENCY (5) at a time, sequentially
    // across batches.
    for (let batchStart = 0; batchStart < activeBookings.length; batchStart += CONCURRENCY) {
      const batch = activeBookings.slice(batchStart, batchStart + CONCURRENCY);
      await Promise.all(batch.map(async (booking) => {
      try {
        // Per-booking dedup
        const alreadyReported = reportedMap.get(booking.clientId)?.has(booking.id) ?? false;
        if (alreadyReported) { skipped++; return; }

        const locale = (booking.client.language ?? 'fr') as 'fr' | 'en';
        const clientName = booking.client.name ?? booking.client.email;
        const ownerFirstName = clientName.split(' ')[0] || clientName;

        // Primary pet (first in booking) for subject line; all pets for email body
        const pets = booking.bookingPets.map(bp => bp.pet);
        const petNamesDisplay = pets.map(p => p.name).join(' & ');

        // Stay duration in days
        const stayDaysCount = Math.floor((now.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24));

        // Fetch admin notes about this client written in the last 7 days
        const adminNotes = await prisma.adminNote.findMany({
          where: {
            entityType: 'CLIENT',
            entityId: booking.clientId,
            createdAt: { gte: sevenDaysAgo },
          },
          select: { content: true },
          take: 20,
          orderBy: { createdAt: 'desc' },
        });
        const adminNotesThisWeek = adminNotes.map(n => n.content);

        // Fetch stay photos uploaded this week.
        // Defense in depth: while the parent booking is already filtered
        // deletedAt:null at line 52, the relation guard here ensures any
        // future refactor (e.g. parallel non-prefiltered loader) cannot
        // leak photos from a soft-deleted booking into the weekly email.
        const stayPhotos = await prisma.stayPhoto.findMany({
          where: {
            bookingId: booking.id,
            booking: notDeleted(),
            createdAt: { gte: sevenDaysAgo },
          },
          select: { url: true },
          take: 3,
          orderBy: { createdAt: 'desc' },
        });
        const photosCount = stayPhotos.length;
        const photoUrls = stayPhotos.map(p => p.url);

        // Generate AI report — returns null on any failure (fail-open)
        const firstPet = pets[0];
        const aiReport = firstPet
          ? await generateWeeklyPetReport({
              ownerFirstName,
              petName: firstPet.name,
              species: firstPet.species as 'DOG' | 'CAT',
              stayDaysCount,
              adminNotesThisWeek,
              photosCount,
              locale,
            })
          : null;

        // Fallback if AI is down or no key
        const fallbackFr = `Votre animal passe une excellente semaine chez nous 🐾`;
        const fallbackEn = `Your pet is having a wonderful week with us 🐾`;
        const reportText = aiReport ?? (locale === 'fr' ? fallbackFr : fallbackEn);

        // Booking URL for the "view photos" button
        const bookingUrl = `${appUrl}/${locale}/client/bookings/${booking.id}`;

        // Build email
        const emailData: Record<string, string> = {
          petName: petNamesDisplay,
          aiReport: reportText,
          bookingUrl,
        };
        if (photoUrls[0]) emailData.photo1Url = photoUrls[0];
        if (photoUrls[1]) emailData.photo2Url = photoUrls[1];
        if (photoUrls[2]) emailData.photo3Url = photoUrls[2];

        const { subject, html } = getEmailTemplate(
          'weekly_pet_report',
          emailData,
          locale,
          pets,
        );

        // Send email + create notification in parallel
        const ops: Promise<unknown>[] = [
          enqueueEmail(
            { to: booking.client.email, subject, html },
            `weekly-report:${booking.id}:${sevenDaysAgo.toISOString().slice(0, 10)}`,
          ),
          createNotification({
            userId: booking.clientId,
            type: 'WEEKLY_PET_REPORT',
            titleFr: `Rapport hebdomadaire de ${petNamesDisplay}`,
            titleEn: `Weekly report for ${petNamesDisplay}`,
            messageFr: `Voici les nouvelles de ${petNamesDisplay} cette semaine chez Dog Universe.`,
            messageEn: `Here is the news from ${petNamesDisplay} this week at Dog Universe.`,
            metadata: { bookingId: booking.id },
          }),
        ];

        const settled = await Promise.allSettled(ops);
        const opFailures = settled.filter(s => s.status === 'rejected').length;
        if (opFailures > 0) {
          errors.push(`partial:${booking.id}: ${opFailures} op(s) failed`);
        }
        sent++;
      } catch (err) {
        errors.push(`${booking.id}: ${String(err)}`);
      }
      }));
    }

    if (errors.length) {
      await log('error', 'cron-weekly-pet-report', 'Some weekly reports failed', { errors });
    }

    return {
      sent,
      skipped,
      total: activeBookings.length,
      errors: errors.length ? errors : undefined,
    };
  },
});
