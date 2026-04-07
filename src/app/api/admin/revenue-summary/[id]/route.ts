/**
 * PATCH  /api/admin/revenue-summary/[id]  — edit (ADMIN+SUPERADMIN)
 * DELETE /api/admin/revenue-summary/[id]  — delete (SUPERADMIN only)
 */

import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const existing = await prisma.monthlyRevenueSummary.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.boardingRevenue !== undefined) data.boardingRevenue = parseFloat(body.boardingRevenue) || 0;
  if (body.groomingRevenue !== undefined) data.groomingRevenue = parseFloat(body.groomingRevenue) || 0;
  if (body.taxiRevenue !== undefined) data.taxiRevenue = parseFloat(body.taxiRevenue) || 0;
  if (body.otherRevenue !== undefined) data.otherRevenue = parseFloat(body.otherRevenue) || 0;
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim().slice(0, 1000) : null;

  const updated = await prisma.monthlyRevenueSummary.update({ where: { id }, data });

  await logAction({
    userId: session.user.id,
    action: 'REVENUE_SUMMARY_UPDATED',
    entityType: 'MonthlyRevenueSummary',
    entityId: id,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  // Destructive: SUPERADMIN only
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden — SUPERADMIN only' }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.monthlyRevenueSummary.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.monthlyRevenueSummary.delete({ where: { id } });

  await logAction({
    userId: session.user.id,
    action: 'REVENUE_SUMMARY_DELETED',
    entityType: 'MonthlyRevenueSummary',
    entityId: id,
    details: { year: existing.year, month: existing.month },
  });

  return NextResponse.json({ message: 'deleted' });
}
