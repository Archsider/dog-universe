import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

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
    const pdfBuffer = await generateInvoicePDF(invoice as Parameters<typeof generateInvoicePDF>[0]);

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
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', service: 'invoice', message: 'PDF generation error', error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
