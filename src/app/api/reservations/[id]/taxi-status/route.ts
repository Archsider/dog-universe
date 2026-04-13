import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';

const VALID_FIELDS = ['taxiGoStatus', 'taxiReturnStatus'] as const;
type TaxiStatusField = typeof VALID_FIELDS[number];

const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS', 'COMPLETED'];

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { field, nextStatus } = body as { field: TaxiStatusField; nextStatus: string };

  if (!VALID_FIELDS.includes(field)) {
    return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(nextStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const updated = await prisma.boardingDetail.update({
    where: { bookingId: params.id },
    data: { [field]: nextStatus },
  });

  return NextResponse.json(updated);
}
