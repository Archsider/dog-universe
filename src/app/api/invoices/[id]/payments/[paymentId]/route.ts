import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { allocatePayments } from '@/lib/payments';
import { cacheDel } from '@/lib/cache';
import { casablancaYMD } from '@/lib/dates-casablanca';

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

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: { select: { role: true } } },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Authz cross-role : ADMIN ne peut supprimer un paiement que sur une
  // facture de CLIENT. SUPERADMIN passe partout.
  if (session.user.role === 'ADMIN' && invoice.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (invoice.status === 'CANCELLED') {
    return NextResponse.json({ error: 'INVOICE_CANCELLED' }, { status: 400 });
  }

  await prisma.payment.delete({ where: { id: paymentId } });
  await allocatePayments(id);

  // O5 — invalide le cache revenue du mois du paiement supprimé.
  // Casa-anchored : symétrie avec l'invalidation côté création (cf.
  // src/lib/payment-allocation.ts). Voir docs/BUSINESS_RULES.md §6.
  const { year: yyyy, month: mm } = casablancaYMD(payment.paymentDate);
  await cacheDel(`revenue:${yyyy}:${mm}`);

  return new NextResponse(null, { status: 204 });
}
