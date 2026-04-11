import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      booking: {
        include: {
          bookingPets: { include: { pet: { select: { name: true, species: true, breed: true } } } },
          boardingDetail: true,
          taxiDetail: true,
        },
      },
      items: true,
    },
  });

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role === 'CLIENT' && invoice.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(invoice);
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updateData: Record<string, unknown> = {};

  // Notes
  if (body.notes !== undefined) {
    updateData.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
  }

  // CANCELLED is the only status override allowed here.
  // All payment-driven status transitions go through POST /api/invoices/[id]/payments.
  if (body.status === 'CANCELLED') {
    updateData.status = 'CANCELLED';
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'NOTHING_TO_UPDATE' }, { status: 400 });
  }

  const updated = await prisma.invoice.update({ where: { id }, data: updateData });
  return NextResponse.json(updated);
}
