import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { allocatePayments } from '@/lib/payments';
import { cacheDel } from '@/lib/cache';
import { casablancaYMD } from '@/lib/dates-casablanca';
import { scheduleMVRefreshIfCurrentMonth } from '@/lib/billing/monthly-revenue';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { PAYMENT_METHODS } from '@/lib/api-schemas/record-payment';

type Params = { params: Promise<{ id: string; paymentId: string }> };

// Body for PATCH — all fields optional, at least one required. The primary
// use case is correcting `paymentDate` to the real bank-settlement date
// (cash-basis Sémantique B : a TPE/transfer paid end-of-month but credited
// next month belongs to next month's revenue). Method/notes editable too.
const patchPaymentBodySchema = z
  .object({
    // Accepts `YYYY-MM-DD` (<input type="date">) or full ISO. Normalised
    // server-side via `new Date()`.
    paymentDate: z.string().min(1).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.paymentDate !== undefined ||
      b.paymentMethod !== undefined ||
      b.notes !== undefined,
    { message: 'NO_FIELDS' },
  );

// ---------------------------------------------------------------------------
// DELETE /api/invoices/[id]/payments/[paymentId] — admin only
// ---------------------------------------------------------------------------
export async function DELETE(_req: Request, { params }: Params) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

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

// ---------------------------------------------------------------------------
// PATCH /api/invoices/[id]/payments/[paymentId] — admin only
// Corrige la date d'encaissement (et/ou méthode/notes) d'un paiement existant.
// Cas d'usage central : un TPE/virement payé fin de mois mais crédité en
// banque le mois suivant doit porter sa VRAIE date de crédit (cash-basis,
// Sémantique B) → le CA bascule alors dans le bon mois. On invalide le cache
// revenue de l'ANCIEN et du NOUVEAU mois, et on rafraîchit la MV si l'un des
// deux est le mois courant.
// ---------------------------------------------------------------------------
export async function PATCH(request: Request, { params }: Params) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id, paymentId } = await params;

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (payment.invoiceId !== id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: { select: { role: true } } },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Authz cross-role : ADMIN ne peut modifier un paiement que sur une facture
  // de CLIENT. SUPERADMIN passe partout.
  if (session.user.role === 'ADMIN' && invoice.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (invoice.status === 'CANCELLED') {
    return NextResponse.json({ error: 'INVOICE_CANCELLED' }, { status: 400 });
  }

  let body: z.infer<typeof patchPaymentBodySchema>;
  try {
    body = patchPaymentBodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'INVALID_BODY', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  // Normalise the new date (if provided) out of the Prisma query.
  const oldDate = payment.paymentDate;
  let newDate: Date | undefined;
  if (body.paymentDate !== undefined) {
    newDate = new Date(body.paymentDate);
    if (Number.isNaN(newDate.getTime())) {
      return NextResponse.json({ error: 'INVALID_PAYMENT_DATE' }, { status: 400 });
    }
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      ...(newDate !== undefined ? { paymentDate: newDate } : {}),
      ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
  });

  // Re-allocate : la date pilote l'ordre chronologique des paiements, donc
  // l'allocation peut changer. Symétrie avec le path DELETE.
  await allocatePayments(id);

  // Invalide le cache revenue de l'ANCIEN mois (d'où le CA part) ET du
  // NOUVEAU mois (où il arrive). Casa-anchored. Voir docs/BUSINESS_RULES.md §6.
  const oldYmd = casablancaYMD(oldDate);
  await cacheDel(`revenue:${oldYmd.year}:${oldYmd.month}`);
  if (newDate !== undefined) {
    const newYmd = casablancaYMD(newDate);
    await cacheDel(`revenue:${newYmd.year}:${newYmd.month}`);
    // Rafraîchit la MV si l'ancien OU le nouveau mois est le mois courant.
    await scheduleMVRefreshIfCurrentMonth(oldDate);
    await scheduleMVRefreshIfCurrentMonth(newDate);
  } else {
    await scheduleMVRefreshIfCurrentMonth(oldDate);
  }

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.PAYMENT_UPDATED,
    entityType: 'Invoice',
    entityId: id,
    details: {
      invoiceNumber: invoice.invoiceNumber,
      paymentId,
      ...(newDate !== undefined
        ? { oldPaymentDate: oldDate.toISOString(), newPaymentDate: newDate.toISOString() }
        : {}),
      ...(body.paymentMethod !== undefined
        ? { oldMethod: payment.paymentMethod, newMethod: body.paymentMethod }
        : {}),
    },
  });

  const updated = await prisma.payment.findUnique({ where: { id: paymentId } });
  return NextResponse.json(updated, { status: 200 });
}
