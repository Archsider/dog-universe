import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { formatMAD } from '@/lib/utils';

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

  const VALID_INVOICE_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];
  const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'];

  const updateData: Record<string, unknown> = {};
  let willBePaid = false;

  // --- Payment amount tracking (preferred path) ---
  if (body.paidAmount !== undefined) {
    const paidAmount = Number(body.paidAmount);
    if (isNaN(paidAmount) || paidAmount < 0) {
      return NextResponse.json({ error: 'Invalid paidAmount' }, { status: 400 });
    }
    updateData.paidAmount = paidAmount;

    if (body.paymentMethod) {
      if (!VALID_PAYMENT_METHODS.includes(body.paymentMethod)) {
        return NextResponse.json({ error: 'Invalid paymentMethod' }, { status: 400 });
      }
      updateData.paymentMethod = body.paymentMethod;
    }
    if (body.paymentDate) updateData.paymentDate = new Date(body.paymentDate);

    // Auto-derive status from paid amount
    if (paidAmount <= 0) {
      updateData.status = 'PENDING';
    } else if (paidAmount < invoice.amount) {
      updateData.status = 'PARTIALLY_PAID';
    } else {
      updateData.status = 'PAID';
      updateData.paidAt = invoice.paidAt ?? (body.paymentDate ? new Date(body.paymentDate) : new Date());
      willBePaid = true;
    }
  }

  // --- Direct status override (legacy: CANCELLED, or explicit PAID without paidAmount) ---
  if (body.status && body.paidAmount === undefined) {
    if (!VALID_INVOICE_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    updateData.status = body.status;
    if (body.status === 'PAID') {
      updateData.paidAmount = invoice.amount;
      updateData.paidAt = new Date();
      if (body.paymentMethod) {
        if (!VALID_PAYMENT_METHODS.includes(body.paymentMethod)) {
          return NextResponse.json({ error: 'Invalid paymentMethod' }, { status: 400 });
        }
        updateData.paymentMethod = body.paymentMethod;
      }
      willBePaid = true;
    }
  }

  if (body.notes !== undefined) updateData.notes = body.notes;

  const updated = await prisma.invoice.update({ where: { id }, data: updateData });

  // Run loyalty update only when transitioning to PAID for the first time
  if (willBePaid && invoice.status !== 'PAID') {
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.INVOICE_PAID,
      entityType: 'Invoice',
      entityId: id,
      details: { invoiceNumber: invoice.invoiceNumber },
    });

    const client = await prisma.user.findUnique({
      where: { id: invoice.clientId },
      select: { language: true, historicalStays: true, historicalSpendMAD: true },
    });
    if (client) {
      const totalPaid = await prisma.invoice.aggregate({
        where: { clientId: invoice.clientId, status: 'PAID' },
        _sum: { amount: true },
      });
      const completedStays = await prisma.booking.count({
        where: { clientId: invoice.clientId, status: 'COMPLETED' },
      });

      // Include historical baseline in loyalty calculation
      const totalStays = completedStays + (client.historicalStays ?? 0);
      const totalRevenue = (totalPaid._sum.amount ?? 0) + (client.historicalSpendMAD ?? 0);

      const { calculateSuggestedGrade } = await import('@/lib/loyalty');
      const suggestedGrade = calculateSuggestedGrade(totalStays, totalRevenue);

      const currentGrade = await prisma.loyaltyGrade.findUnique({
        where: { clientId: invoice.clientId },
      });

      if (currentGrade && !currentGrade.isOverride && currentGrade.grade !== suggestedGrade) {
        await prisma.loyaltyGrade.update({
          where: { clientId: invoice.clientId },
          data: { grade: suggestedGrade },
        });
        const { createLoyaltyUpdateNotification } = await import('@/lib/notifications');
        await createLoyaltyUpdateNotification(invoice.clientId, suggestedGrade, client.language || 'fr');
      }

      // Notify client that invoice is paid (notification + email)
      const { createInvoicePaidNotification } = await import('@/lib/notifications');
      await createInvoicePaidNotification(invoice.clientId, invoice.invoiceNumber, formatMAD(invoice.amount));
    }
  }

  return NextResponse.json(updated);
}
