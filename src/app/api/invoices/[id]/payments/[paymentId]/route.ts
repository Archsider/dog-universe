import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { allocatePayments } from '@/lib/payments';
import { cacheDel } from '@/lib/cache';

type Params = { params: Promise<{ id: string; paymentId: string }> };

// ---------------------------------------------------------------------------
// DELETE /api/invoices/[id]/payments/[paymentId] — admin only
// ---------------------------------------------------------------------------
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id, paymentId } = await params;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (payment.invoiceId !== id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invoice.status === 'CANCELLED') {
    return NextResponse.json({ error: 'INVOICE_CANCELLED' }, { status: 400 });
  }

  await prisma.payment.delete({ where: { id: paymentId } });
  await allocatePayments(id);

  // O5 — invalide le cache revenue du mois du paiement supprimé.
  const yyyy = payment.paymentDate.getFullYear();
  const mm = payment.paymentDate.getMonth() + 1;
  await cacheDel(`revenue:${yyyy}:${mm}`);

  return new NextResponse(null, { status: 204 });
}
