import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const client = await prisma.user.findUnique({
    where: { id, role: 'CLIENT' },
    include: {
      pets: {
        include: {
          vaccinations: { orderBy: { date: 'desc' } },
          documents: { orderBy: { uploadedAt: 'desc' } },
        },
      },
      loyaltyGrade: true,
      bookings: {
        include: {
          bookingPets: { include: { pet: true } },
          boardingDetail: true,
          taxiDetail: true,
          invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
        },
        orderBy: { startDate: 'desc' },
      },
      invoices: {
        include: { items: true },
        orderBy: { issuedAt: 'desc' },
      },
    },
  });

  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const totalRevenue = client.invoices
    .filter((i) => i.status === 'PAID')
    .reduce((sum, i) => sum + i.amount, 0);

  const adminNotes = await prisma.adminNote.findMany({
    where: { entityType: 'CLIENT', entityId: id },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    ...client,
    passwordHash: undefined,
    totalRevenue,
    adminNotes,
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.phone !== undefined) updateData.phone = body.phone;

  await prisma.user.update({ where: { id }, data: updateData });

  return NextResponse.json({ message: 'ok' });
}
