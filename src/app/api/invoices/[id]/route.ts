import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

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
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updateData: Record<string, unknown> = {};
  if (body.status) updateData.status = body.status;
  if (body.status === 'PAID') {
    updateData.paidAt = new Date();
  }
  if (body.notes !== undefined) updateData.notes = body.notes;

  const updated = await prisma.invoice.update({ where: { id }, data: updateData });

  if (body.status === 'PAID') {
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.INVOICE_PAID,
      entityType: 'Invoice',
      entityId: id,
      details: { invoiceNumber: invoice.invoiceNumber },
    });

    // Update loyalty grade if needed
    const client = await prisma.user.findUnique({ where: { id: invoice.clientId } });
    if (client) {
      const totalPaid = await prisma.invoice.aggregate({
        where: { clientId: invoice.clientId, status: 'PAID' },
        _sum: { amount: true },
      });
      const totalStays = await prisma.booking.count({
        where: { clientId: invoice.clientId, status: 'COMPLETED' },
      });

      const { calculateSuggestedGrade } = await import('@/lib/loyalty');
      const suggestedGrade = calculateSuggestedGrade(totalStays, totalPaid._sum.amount ?? 0);

      const currentGrade = await prisma.loyaltyGrade.findUnique({
        where: { clientId: invoice.clientId },
      });

      if (currentGrade && !currentGrade.isOverride && currentGrade.grade !== suggestedGrade) {
        await prisma.loyaltyGrade.update({
          where: { clientId: invoice.clientId },
          data: { grade: suggestedGrade },
        });
      }
    }
  }

  return NextResponse.json(updated);
}
