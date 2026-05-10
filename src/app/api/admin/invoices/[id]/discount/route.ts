import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { z } from 'zod';

interface Params { params: Promise<{ id: string }> }

const discountSchema = z.object({
  type: z.enum(['AMOUNT', 'PERCENT']),
  value: z.number().positive().max(999999),
  reason: z.string().trim().max(200).optional(),
});

/**
 * POST /api/admin/invoices/[id]/discount
 *
 * Applique une remise sur la facture. Si une remise existe déjà, elle
 * est remplacée (une seule remise par facture).
 *
 * Body :
 *   { type: 'AMOUNT', value: 200 }                    → remise -200 MAD
 *   { type: 'PERCENT', value: 10 }                    → remise -10% du sous-total
 *   { type: 'AMOUNT', value: 200, reason: 'fidélité' } → libellé personnalisé
 *
 * Mécanique :
 *   - Calcule le sous-total = SUM(items.total) hors items DISCOUNT existants.
 *   - Pour PERCENT : montant = round(sous-total × pct / 100, 2).
 *   - Refuse si le nouveau montant rendrait `amount < paidAmount` (la
 *     contrainte DB le bloquerait sinon).
 *   - Insère un InvoiceItem category='DISCOUNT' avec unitPrice/total négatifs.
 *   - Le trigger trg_recompute_invoice_amount met Invoice.amount à jour seul.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id: invoiceId } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const parsed = discountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() }, { status: 400 });
  }
  const { type, value, reason } = parsed.data;
  if (type === 'PERCENT' && value > 100) {
    return NextResponse.json({ error: 'PERCENT_OVER_100' }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, paidAmount: true, items: true },
  });
  if (!invoice) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (invoice.status === 'CANCELLED') {
    return NextResponse.json({ error: 'INVOICE_CANCELLED' }, { status: 400 });
  }

  // Sous-total = somme des items NON DISCOUNT
  const subtotal = invoice.items
    .filter((it) => it.category !== 'DISCOUNT')
    .reduce((sum, it) => sum + toNumber(it.total), 0);

  // Montant de la remise (toujours positif ici, on stocke en négatif après)
  const discountAmount = type === 'PERCENT'
    ? Math.round((subtotal * value / 100) * 100) / 100
    : Math.round(value * 100) / 100;

  if (discountAmount <= 0) {
    return NextResponse.json({ error: 'INVALID_DISCOUNT_AMOUNT' }, { status: 400 });
  }
  if (discountAmount > subtotal) {
    return NextResponse.json({ error: 'DISCOUNT_EXCEEDS_SUBTOTAL', subtotal, discountAmount }, { status: 400 });
  }

  const newInvoiceAmount = Math.round((subtotal - discountAmount) * 100) / 100;
  const paidAmount = toNumber(invoice.paidAmount);
  if (newInvoiceAmount + 0.01 < paidAmount) {
    return NextResponse.json({
      error: 'AMOUNT_BELOW_PAID',
      hint: `Nouveau montant ${newInvoiceAmount} MAD < déjà encaissé ${paidAmount} MAD`,
    }, { status: 400 });
  }

  const description = type === 'PERCENT'
    ? `Remise ${value}%${reason ? ` — ${reason}` : ''}`
    : `Remise${reason ? ` — ${reason}` : ''}`;

  // Une seule remise par facture : remplace si existe.
  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({
      where: { invoiceId, category: 'DISCOUNT' },
    });
    await tx.invoiceItem.create({
      data: {
        invoiceId,
        description,
        quantity: 1,
        unitPrice: new Prisma.Decimal(-discountAmount),
        total: new Prisma.Decimal(-discountAmount),
        category: 'DISCOUNT',
      },
    });
  });
  // Le trigger DB recompute Invoice.amount automatiquement.

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.INVOICE_UPDATED,
    entityType: 'Invoice',
    entityId: invoiceId,
    details: { kind: 'DISCOUNT_APPLIED', type, value, computed: discountAmount, reason: reason ?? null },
  });

  return NextResponse.json({
    success: true,
    discount: { type, value, computed: discountAmount, description },
    newAmount: newInvoiceAmount,
  });
}

/**
 * DELETE /api/admin/invoices/[id]/discount
 * Retire la remise (s'il y en a une).
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id: invoiceId } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const removed = await prisma.invoiceItem.deleteMany({
    where: { invoiceId, category: 'DISCOUNT' },
  });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.INVOICE_UPDATED,
    entityType: 'Invoice',
    entityId: invoiceId,
    details: { kind: 'DISCOUNT_REMOVED', removedCount: removed.count },
  });

  return NextResponse.json({ success: true, removed: removed.count });
}
