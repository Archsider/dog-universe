import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      booking: {
        include: {
          bookingPets: { include: { pet: true } },
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
        'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
