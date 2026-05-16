// POST /api/admin/invoices/[id]/cancel
//
// Dedicated cancel flow for an Invoice. Delegates to the canonical
// `cancelInvoice` helper (src/lib/billing/cancel-invoice.ts) which owns
// the state machine, cascade unlink of BookingItem.invoiceItemId, and
// optional refund path. Auth gate + observability span + audit log are
// the route's responsibility.
//
// Source : audit produit 2026-05-17 (Mehdi / Marie Lagarde DU-2026-0052)
// — facture supplémentaire fantôme bloquée dans le dashboard, aucun
// endpoint DELETE n'existant pour les invoices.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { cancelInvoice } from '@/lib/billing/cancel-invoice';
import { withSpan } from '@/lib/observability';
import { toNumber } from '@/lib/decimal';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  reason: z.string().trim().min(10, 'reason ≥ 10 chars required').max(2000),
  /** Only required when the invoice has paidAmount > 0. */
  refundExisting: z.boolean().optional(),
  paymentMethodForRefund: z.enum(['CASH', 'CARD', 'CHECK', 'TRANSFER']).optional(),
  /** When true, skip the client notification (silent admin cancel — data cleanup). */
  silent: z.boolean().optional(),
}).strict();

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id: invoiceId } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'INVALID_BODY', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  return withSpan(
    'api.admin.invoice.cancel',
    { invoiceId, role: session.user.role, refundExisting: body.refundExisting === true },
    async () => {
      const r = await cancelInvoice({
        invoiceId,
        reason: body.reason,
        actorId: session.user.id,
        actorRole: session.user.role as 'ADMIN' | 'SUPERADMIN',
        refundExisting: body.refundExisting,
        paymentMethodForRefund: body.paymentMethodForRefund,
      });

      if (!r.ok) {
        const status =
          r.error === 'INVOICE_NOT_FOUND' ? 404
          : r.error === 'CROSS_ROLE_FORBIDDEN' ? 403
          : r.error === 'ALREADY_CANCELLED' ? 409
          : 400;
        return NextResponse.json({ error: r.error, detail: r.detail }, { status });
      }

      // Fetch the cancelled invoice's clientId / amount for the notif.
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { clientId: true, amount: true, paidAmount: true },
      });

      // Client notification (best-effort, fail-open).
      if (invoice && !body.silent) {
        try {
          const { createInvoiceCancelledNotification } = await import('@/lib/notifications');
          await createInvoiceCancelledNotification({
            userId: invoice.clientId,
            invoiceId: r.invoiceId,
            invoiceNumber: r.invoiceNumber,
            reason: body.reason,
            amount: toNumber(invoice.amount),
          });
        } catch {
          // Notification failure is non-fatal — the cancel is already
          // persisted ; logger captures structured details.
        }
      }

      await logAction({
        userId: session.user.id,
        action: LOG_ACTIONS.INVOICE_CANCELLED,
        entityType: 'Invoice',
        entityId: r.invoiceId,
        details: {
          invoiceNumber: r.invoiceNumber,
          previousStatus: r.previousStatus,
          reason: body.reason,
          bookingItemsUnlinked: r.bookingItemsUnlinked,
          refundExisting: body.refundExisting === true,
          paidAmount: invoice ? toNumber(invoice.paidAmount) : 0,
          silent: body.silent === true,
        },
      });

      return NextResponse.json({
        ok: true,
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoiceNumber,
        previousStatus: r.previousStatus,
        bookingItemsUnlinked: r.bookingItemsUnlinked,
      });
    },
  );
}
