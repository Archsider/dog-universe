import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const serviceType = searchParams.get('type');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (serviceType) where.serviceType = serviceType;

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, email: true } },
        bookingPets: { include: { pet: true } },
        boardingDetail: true,
        taxiDetail: true,
        invoice: { select: { id: true, invoiceNumber: true, amount: true, status: true } },
      },
      orderBy: { startDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return NextResponse.json({ bookings, total, page, limit });
}
