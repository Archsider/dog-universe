import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { decodeCursor, encodeCursor, parseLimit } from '@/lib/pagination';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const serviceType = searchParams.get('type');
  const limit = parseLimit(searchParams.get('limit'));
  const cursorRaw = searchParams.get('cursor');
  const decoded = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !decoded) {
    return NextResponse.json({ error: 'INVALID_CURSOR' }, { status: 400 });
  }

  const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED'];
  const VALID_SERVICE_TYPES = ['BOARDING', 'PET_TAXI'];

  const where: Record<string, unknown> = { deletedAt: null }; // soft-delete: required — no global extension (Edge Runtime incompatible)
  if (status && VALID_STATUSES.includes(status)) where.status = status;
  if (serviceType && VALID_SERVICE_TYPES.includes(serviceType)) where.serviceType = serviceType;

  if (decoded) {
    where.AND = [
      {
        OR: [
          { createdAt: { lt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { lt: decoded.id } },
        ],
      },
    ];
  }

  // Slim select for list/Kanban view — heavier fields belong to the detail route
  const items = await prisma.booking.findMany({
    where,
    select: {
      id: true,
      status: true,
      serviceType: true,
      startDate: true,
      endDate: true,
      arrivalTime: true,
      notes: true,
      totalPrice: true,
      version: true,
      createdAt: true,
      client: { select: { id: true, name: true, email: true, phone: true } },
      bookingPets: {
        select: {
          pet: { select: { id: true, name: true, species: true, photoUrl: true } },
        },
      },
      invoice: { select: { id: true, invoiceNumber: true, status: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return NextResponse.json({ data, nextCursor, hasMore });
}
