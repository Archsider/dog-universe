import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

const PLACEHOLDER_EMAIL = 'passage@doguniverse.ma';

/**
 * POST /api/invoices/[id]/send-email — generate the invoice PDF and email it to
 * the client as an attachment. Awaited (the admin sees success/failure inline),
 * unlike the fire-and-forget transactional notifications.
 */
export async function POST(_req: Request, { params }: Params) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, language: true, role: true } },
      booking: {
        include: {
          bookingPets: { include: { pet: true } },
          boardingDetail: true,
          taxiDetail: true,
        },
      },
      items: { orderBy: { id: 'asc' } },
      payments: { orderBy: { paymentDate: 'asc' } },
    },
  });

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role === 'ADMIN' && invoice.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // Recipient: the invoice display email override, else the real client email
  // (never the synthetic walk-in placeholder).
  const to = invoice.clientDisplayEmail
    || (invoice.client.email && invoice.client.email !== PLACEHOLDER_EMAIL ? invoice.client.email : '');
  if (!to) {
    return NextResponse.json({ error: 'NO_EMAIL' }, { status: 400 });
  }

  const isFr = (invoice.client.language ?? 'fr') !== 'en';
  const clientName = invoice.clientDisplayName ?? invoice.client.name ?? '';

  try {
    const { generateInvoicePDF } = await import('@/lib/pdf');
    const invoiceForPdf = {
      ...invoice,
      amount: Number(invoice.amount),
      paidAmount: Number(invoice.paidAmount),
      items: invoice.items.map((it) => ({
        ...it,
        unitPrice: Number(it.unitPrice),
        total: Number(it.total),
        allocatedAmount: Number(it.allocatedAmount),
      })),
      payments: invoice.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    };
    const pdfBuffer = await generateInvoicePDF(invoiceForPdf as Parameters<typeof generateInvoicePDF>[0]);

    const subject = isFr
      ? `Votre facture ${invoice.invoiceNumber} — Dog Universe`
      : `Your invoice ${invoice.invoiceNumber} — Dog Universe`;
    const greeting = clientName ? (isFr ? `Bonjour ${clientName.split(' ')[0]},` : `Hello ${clientName.split(' ')[0]},`) : (isFr ? 'Bonjour,' : 'Hello,');
    const html = isFr
      ? `<p>${greeting}</p><p>Veuillez trouver ci-joint votre facture <strong>${invoice.invoiceNumber}</strong> au format PDF.</p><p>Merci de votre confiance 🐾<br><strong>Dog Universe</strong></p>`
      : `<p>${greeting}</p><p>Please find attached your invoice <strong>${invoice.invoiceNumber}</strong> in PDF format.</p><p>Thank you for your trust 🐾<br><strong>Dog Universe</strong></p>`;

    await sendEmail({
      to,
      subject,
      html,
      attachments: [{
        filename: `${invoice.invoiceNumber}.pdf`,
        content: Buffer.from(pdfBuffer),
        contentType: 'application/pdf',
      }],
    });

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.INVOICE_SENT_EMAIL,
      entityType: 'Invoice',
      entityId: id,
      details: { invoiceNumber: invoice.invoiceNumber },
    });

    return NextResponse.json({ ok: true, to });
  } catch (error) {
    logger.error('invoice', 'send-email failed', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'EMAIL_SEND_FAILED' }, { status: 500 });
  }
}
