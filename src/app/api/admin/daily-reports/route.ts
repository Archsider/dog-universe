// GET /api/admin/daily-reports?date=YYYY-MM-DD
//
// Lists all reports for a given Casa day with the bare minimum the admin UI
// needs : pet + client info + content + status.  Defaults to today.

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { todayCasaYmd } from '@/lib/daily-reports';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const requested = url.searchParams.get('date');
  // Accept only 'YYYY-MM-DD' shape ; everything else falls back to today.
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
    ? requested
    : todayCasaYmd();

  const reports = await prisma.dailyReport.findMany({
    where: { date },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      bookingId: true,
      petId: true,
      date: true,
      photoUrls: true,
      moodEmoji: true,
      foodEmoji: true,
      sleepEmoji: true,
      playEmoji: true,
      note: true,
      status: true,
      sentAt: true,
      sentBy: true,
      skipReason: true,
      emailFailed: true,
      pet: {
        select: {
          name: true,
          species: true,
          photoUrl: true,
          isPermanentResident: true,
        },
      },
      booking: {
        select: {
          id: true,
          startDate: true,
          endDate: true,
          isOpenEnded: true,
          client: {
            select: {
              id: true,
              name: true,
              firstName: true,
              email: true,
              phone: true,
              isWalkIn: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ date, reports });
}
