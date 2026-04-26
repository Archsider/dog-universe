/**
 * GET  /api/admin/revenue-summary        — list all monthly summaries
 * POST /api/admin/revenue-summary        — create (ADMIN+SUPERADMIN)
 *
 * Body for POST:
 *   { year, month, boardingRevenue?, groomingRevenue?, taxiRevenue?, otherRevenue?, notes? }
 */

import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';

export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const summaries = await prisma.monthlyRevenueSummary.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: { author: { select: { name: true } } },
  });

  return NextResponse.json(summaries);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const year = parseInt(body.year);
  const month = parseInt(body.month);

  if (!year || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  }
  if (!month || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid month (1–12)' }, { status: 400 });
  }

  const boardingRevenue = parseFloat(body.boardingRevenue ?? 0) || 0;
  const groomingRevenue = parseFloat(body.groomingRevenue ?? 0) || 0;
  const taxiRevenue = parseFloat(body.taxiRevenue ?? 0) || 0;
  const otherRevenue = parseFloat(body.otherRevenue ?? 0) || 0;
  const notes = body.notes ? String(body.notes).trim().slice(0, 1000) : null;

  // Upsert: if month already exists, update it
  const summary = await prisma.monthlyRevenueSummary.upsert({
    where: { year_month: { year, month } },
    create: {
      year,
      month,
      boardingRevenue,
      groomingRevenue,
      taxiRevenue,
      otherRevenue,
      notes,
      createdBy: session.user.id,
    },
    update: {
      boardingRevenue,
      groomingRevenue,
      taxiRevenue,
      otherRevenue,
      notes,
    },
  });

  await logAction({
    userId: session.user.id,
    action: 'REVENUE_SUMMARY_UPSERTED',
    entityType: 'MonthlyRevenueSummary',
    entityId: summary.id,
    details: { year, month, total: boardingRevenue + groomingRevenue + taxiRevenue + otherRevenue },
  });

  return NextResponse.json(summary, { status: 201 });
}
