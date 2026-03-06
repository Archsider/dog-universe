import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computeGradeFromStats, isUpgrade, POINTS_PER_SERVICE } from '@/lib/loyalty';
import { createLoyaltyUpdateNotification } from '@/lib/notifications';

/**
 * GET /api/cron/loyalty
 * Called monthly by Vercel Cron (see vercel.json).
 * Auto-computes loyalty grades from rolling 24-month stats for all clients.
 * Skips clients whose grade has been manually overridden (isOverride=true).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since24Months = new Date();
  since24Months.setMonth(since24Months.getMonth() - 24);

  // Get all clients with their loyalty grades
  const clients = await prisma.user.findMany({
    where: { role: 'CLIENT' },
    select: {
      id: true,
      loyaltyGrade: { select: { grade: true, isOverride: true } },
    },
  });

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const client of clients) {
    try {
      // Skip manually overridden grades
      if (client.loyaltyGrade?.isOverride) {
        skipped++;
        continue;
      }

      // Compute rolling 24-month stats: boarding nights + points from all services
      // Note: GROOMING is an add-on to BOARDING (boardingDetail.includeGrooming), not a separate serviceType
      const [completedBoardings, groomingCount, taxiCount] = await Promise.all([
        prisma.booking.findMany({
          where: {
            clientId: client.id,
            serviceType: 'BOARDING',
            status: 'COMPLETED',
            startDate: { gte: since24Months },
          },
          select: { startDate: true, endDate: true },
        }),
        prisma.booking.count({
          where: {
            clientId: client.id,
            serviceType: 'BOARDING',
            status: 'COMPLETED',
            startDate: { gte: since24Months },
            boardingDetail: { includeGrooming: true },
          },
        }),
        prisma.booking.count({
          where: {
            clientId: client.id,
            serviceType: 'PET_TAXI',
            status: 'COMPLETED',
            startDate: { gte: since24Months },
          },
        }),
      ]);

      let nights = 0;

      for (const booking of completedBoardings) {
        if (booking.startDate && booking.endDate) {
          const diffMs = booking.endDate.getTime() - booking.startDate.getTime();
          nights += Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        }
      }

      const points =
        nights * POINTS_PER_SERVICE.BOARDING_PER_NIGHT +
        groomingCount * POINTS_PER_SERVICE.GROOMING +
        taxiCount * POINTS_PER_SERVICE.PET_TAXI;

      const newGrade = computeGradeFromStats(nights, points);
      const currentGrade = client.loyaltyGrade?.grade ?? 'MEMBER';

      if (newGrade === currentGrade) continue;

      // Update grade in DB
      await prisma.loyaltyGrade.upsert({
        where: { clientId: client.id },
        create: { clientId: client.id, grade: newGrade, isOverride: false },
        update: { grade: newGrade, isOverride: false },
      });

      // Notify client only on upgrade
      if (isUpgrade(currentGrade, newGrade)) {
        await createLoyaltyUpdateNotification(client.id, newGrade);
      }

      updated++;
    } catch (err) {
      errors.push(`${client.id}: ${String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    total: clients.length,
    errors: errors.length ? errors : undefined,
  });
}
