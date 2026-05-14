import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const inline = new URL(req.url).searchParams.get('view') === '1';

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true, language: true } },
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
  if (session.user.role === 'CLIENT' && invoice.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { generateInvoicePDF } = await import('@/lib/pdf');
    // Convert Decimal columns → number at the boundary so the PDF generator
    // (which works on plain numbers) doesn't have to know about Prisma.Decimal.
    const invoiceForPdf = {
      ...invoice,
      amount: Number(invoice.amount),
      paidAmount: Number(invoice.paidAmount),
      items: invoice.items.map(it => ({
        ...it,
        unitPrice: Number(it.unitPrice),
        total: Number(it.total),
        allocatedAmount: Number(it.allocatedAmount),
      })),
      payments: invoice.payments.map(p => ({ ...p, amount: Number(p.amount) })),
    };
    const pdfBuffer = await generateInvoicePDF(invoiceForPdf as Parameters<typeof generateInvoicePDF>[0]);

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.INVOICE_DOWNLOADED,
      entityType: 'Invoice',
      entityId: id,
      details: { invoiceNumber: invoice.invoiceNumber },
    });

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': inline ? `inline; filename="${invoice.invoiceNumber}.pdf"` : `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        'Content-Length': pdfBuffer.byteLength.toString(),
        // Invoices are mutable: admin can add a discount or edit items, then
        // re-open the same `?view=1` URL — Chrome's PDF viewer would
        // otherwise serve the previous render from disk cache. Force a
        // fresh fetch every time. The download path (no `?view=1`) shows
        // the right number because the file is saved, not cached as a
        // navigable URL — but we set the header uniformly anyway so
        // a proxy/CDN can't second-guess us.
        'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    logger.error('invoice', 'PDF generation error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
