import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/clients/search?q=...
 *
 * Lightweight autocomplete endpoint for admin client pickers.
 * Returns up to 50 matches when `q` is >= 2 chars, otherwise the 20 most
 * recently created clients. Used by `ClientSearchSelect` to avoid loading
 * the full `take: 1000` clients dropdown on /admin/billing.
 *
 * Auth: ADMIN | SUPERADMIN.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();

  // soft-delete: required — no global extension (Edge Runtime incompatible)
  const baseWhere = { role: 'CLIENT' as const, deletedAt: null };

  if (q.length < 2) {
    const clients = await prisma.user.findMany({
      where: baseWhere,
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return NextResponse.json({ clients });
  }

  const clients = await prisma.user.findMany({
    where: {
      ...baseWhere,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
    take: 50,
  });

  return NextResponse.json({ clients });
}
