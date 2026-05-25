import { defineCron } from '@/lib/cron-runner';
import { prisma } from '@/lib/prisma';
import { notDeleted, contactable } from '@/lib/prisma-soft';
import { getCapacityLimits } from '@/lib/capacity';
import { loadTodaySnapshot } from '@/app/[locale]/admin/reservations/_lib/today-queries';
import { loadBirthdays } from '@/app/[locale]/admin/dashboard/_lib/loaders/birthdays';
import { loadVaccines } from '@/app/[locale]/admin/dashboard/_lib/loaders/vaccines';
import { loadCapacity7d } from '@/app/[locale]/admin/dashboard/_lib/loaders/capacity-7d';
import { buildMorningDigestData, buildMorningDigestSummary, type MorningDigestInput } from '@/lib/morning-digest';
import { getEmailTemplate } from '@/lib/email';
import { sendEmailNow } from '@/lib/notify-now';
import { toNumber } from '@/lib/decimal';
import { formatDate, formatMAD } from '@/lib/utils';
import { APP_URL } from '@/lib/config';

export const maxDuration = 60;

/**
 * Daily operational digest emailed to ADMIN/SUPERADMIN at ~07h Casablanca
 * (06:00 UTC). Reuses the dashboard's Today snapshot + live occupancy + unpaid
 * totals. The unpaid section links to /admin/billing where each invoice has a
 * one-tap WhatsApp "Relancer" button.
 */
export const GET = defineCron({
  name: 'morning-digest',
  period: 'daily',
  fn: async ({ now, logger }) => {
    const [snapshot, limits, unpaidAgg, inProgress, admins, birthdays, vaccines, capacity7d] = await Promise.all([
      loadTodaySnapshot(now),
      getCapacityLimits(),
      prisma.invoice.aggregate({
        where: { status: { in: ['PENDING', 'PARTIALLY_PAID'] } },
        _count: true,
        _sum: { amount: true, paidAmount: true },
      }),
      prisma.booking.findMany({
        where: notDeleted({ serviceType: 'BOARDING', status: 'IN_PROGRESS' }),
        select: { bookingPets: { select: { pet: { select: { species: true } } } } },
      }),
      prisma.user.findMany({
        where: { ...contactable(), role: { in: ['ADMIN', 'SUPERADMIN'] } },
        select: { email: true, language: true },
        take: 50,
      }),
      loadBirthdays(),
      loadVaccines(),
      loadCapacity7d(),
    ]);

    let dogsIn = 0;
    let catsIn = 0;
    for (const b of inProgress) {
      for (const bp of b.bookingPets) {
        if (bp.pet?.species === 'DOG') dogsIn++;
        else if (bp.pet?.species === 'CAT') catsIn++;
      }
    }

    const unpaidRemaining = Math.max(
      0,
      toNumber(unpaidAgg._sum.amount) - toNumber(unpaidAgg._sum.paidAmount),
    );
    const unpaidCount = unpaidAgg._count;

    const base = {
      arrivals: snapshot.arrivals.map((a) => ({ name: a.client.name, time: a.arrivalTime })),
      departures: snapshot.departures.map((d) => ({ name: d.client.name })),
      presentCount: snapshot.kpis.present,
      pendingCount: snapshot.kpis.pending,
      unpaidCount,
      unpaidTotalLabel: formatMAD(unpaidRemaining),
      dogsIn,
      dogsLimit: limits.dogs,
      catsIn,
      catsLimit: limits.cats,
      birthdays: birthdays.slice(0, 15).map((b) => ({ petName: b.petName, ownerName: b.ownerName })),
      vaccines: vaccines.map((v) => ({ petName: v.petName, vaccineType: v.vaccineType, expiry: v.expiryYmd })),
      occupancy7d: capacity7d.days.map((day) => ({
        // Locale-neutral DD/MM label from the Casa ymd (e.g. "2026-05-28" → "28/05").
        label: `${day.ymd.slice(8, 10)}/${day.ymd.slice(5, 7)}`,
        dogsCount: day.dogsCount,
        catsCount: day.catsCount,
      })),
    };

    let sent = 0;
    for (const admin of admins) {
      if (!admin.email) continue;
      const locale = admin.language === 'en' ? 'en' : 'fr';
      const input: MorningDigestInput = {
        ...base,
        dateLabel: formatDate(now, locale),
        dashboardUrl: `${APP_URL}/${locale}/admin/dashboard`,
        billingUrl: `${APP_URL}/${locale}/admin/billing?status=PENDING`,
      };
      const data = buildMorningDigestData(input);
      const { subject, html } = getEmailTemplate('morning_digest', data, locale);
      sendEmailNow({ to: admin.email, subject, html });
      sent++;
    }

    const summary = buildMorningDigestSummary({ ...base, dateLabel: '', dashboardUrl: '', billingUrl: '' }, 'fr');
    logger.info('cron', 'morning-digest sent', { recipients: sent, summary });

    return { recipients: sent, arrivals: base.arrivals.length, departures: base.departures.length, pending: base.pendingCount, unpaidCount, birthdays: base.birthdays.length, vaccines: base.vaccines.length };
  },
});
