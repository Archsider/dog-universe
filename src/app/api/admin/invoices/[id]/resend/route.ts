import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { formatMAD } from '@/lib/utils';
import { createInvoiceNotification, createInvoicePaidNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/invoices/[id]/resend
 * Manually resend the invoice notification + email to the client.
 * For PAID invoices, sends the payment confirmation.
 * For PENDING/PARTIALLY_PAID, sends the invoice available notification.
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true, email: true, language: true } } },
  });

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const client = invoice.client;
  const locale = client.language ?? 'fr';
  const amountStr = formatMAD(invoice.amount);

  await Sentry.startSpan(
    { name: 'mutation.invoice.resend', op: 'http.server', attributes: { invoiceId: id, status: invoice.status } },
    async () => {
      if (invoice.status === 'PAID') {
        await createInvoicePaidNotification(client.id, invoice.invoiceNumber, amountStr);
      } else {
        await createInvoiceNotification(client.id, invoice.invoiceNumber, amountStr);
        const { subject, html } = getEmailTemplate('invoice_available', {
          clientName: client.name ?? client.email,
          invoiceNumber: invoice.invoiceNumber,
          amount: amountStr,
        }, locale);
        await sendEmail({ to: client.email, subject, html });
      }
    },
  );

  return NextResponse.json({ ok: true });
}
