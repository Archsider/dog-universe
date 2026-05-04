import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/reviews
 * Liste paginée des avis avec filtres optionnels.
 * Auth: ADMIN / SUPERADMIN
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const take = 20;
  const skip = (page - 1) * take;

  const ratingParam = searchParams.get('rating');
  const ratingFilter = ratingParam ? parseInt(ratingParam, 10) : undefined;
  const sortParam = searchParams.get('sort');
  const orderByField: 'createdAt' | 'rating' =
    sortParam === 'rating' ? 'rating' : 'createdAt';

  const where = ratingFilter && ratingFilter >= 1 && ratingFilter <= 5
    ? { rating: ratingFilter }
    : {};

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, email: true } },
        booking: { select: { id: true, serviceType: true, startDate: true, endDate: true } },
      },
      orderBy: { [orderByField]: 'desc' },
      take,
      skip,
    }),
    prisma.review.count({ where }),
  ]);

  return NextResponse.json({ reviews, total, page, pageSize: take });
}
