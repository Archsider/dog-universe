// POST /api/admin/bookings/[id]/invoices/supplementary
//
// Generates a supplementary Invoice for every BookingItem that isn't yet
// linked to an InvoiceItem (invoiceItemId IS NULL). Atomic transaction:
//   1) main invoice lookup (must exist)
//   2) gather unbilled BookingItems
//   3) allocate a fresh invoice number from InvoiceSequence
//   4) create Invoice (supplementaryForBookingId = bookingId)
//   5) create one InvoiceItem per BookingItem and back-link via
//      BookingItem.invoiceItemId so they're flagged as billed.
//
// Returns 400 with explicit error codes when the booking has no main invoice
// or no unbilled items.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { toNumber } from '@/lib/decimal';
import { notDeleted } from '@/lib/prisma-soft';
import { withSpan } from '@/lib/observability';

interface Params { params: Promise<{ id: string }> }

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

async function allocateInvoiceNumber(tx: Prisma.TransactionClient, year: number): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const seqRow = await tx.$queryRaw<{ lastSeq: number }[]>`
      INSERT INTO "InvoiceSequence" (year, "lastSeq")
      VALUES (${year}, 1)
      ON CONFLICT (year)
      DO UPDATE SET "lastSeq" = "InvoiceSequence"."lastSeq" + 1
      RETURNING "lastSeq"
    `;
    const seq = seqRow[0]?.lastSeq;
    if (typeof seq !== 'number') break;
    const candidate = `DU-${year}-${String(seq).padStart(4, '0')}`;
    const exists = await tx.invoice.findUnique({ where: { invoiceNumber: candidate } });
    if (!exists) return candidate;
  }
  return null;
}

export async function POST(_request: NextRequest, { params }: Params) {
  const { id: bookingId } = await params;
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    select: {
      id: true, clientId: true, startDate: true,
      invoice: { select: { id: true, status: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (!booking.invoice) {
    return NextResponse.json({ error: 'NO_MAIN_INVOICE' }, { status: 400 });
  }

  try {
    const result = await withSpan(
      'api.admin.invoices.supplementary',
      { bookingId, actorId: session.user.id },
      () => prisma.$transaction(async (tx) => {
      const unbilled = await tx.bookingItem.findMany({
        where: { bookingId, invoiceItemId: null },
      });
      if (unbilled.length === 0) {
        throw new Error('NOTHING_TO_INVOICE');
      }

      const { casablancaYMD } = await import('@/lib/dates-casablanca');
      const year = casablancaYMD().year;
      const invoiceNumber = await allocateInvoiceNumber(tx, year);
      if (!invoiceNumber) throw new Error('SEQUENCE_FAILED');

      const amount = unbilled.reduce((s, it) => s + toNumber(it.total as never), 0);

      const invoice = await tx.invoice.create({
        data: {
          clientId: booking.clientId,
          invoiceNumber,
          amount: new Prisma.Decimal(amount),
          status: 'PENDING',
          supplementaryForBookingId: bookingId,
          periodDate: booking.startDate,
        },
      });

      for (const item of unbilled) {
        const invItem = await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
            category: item.category,
            productId: item.productId,
          },
        });
        await tx.bookingItem.update({
          where: { id: item.id },
          data: { invoiceItemId: invItem.id },
        });
      }

      await tx.actionLog.create({
        data: {
          userId: session.user.id,
          action: 'SUPPLEMENTARY_INVOICE_CREATED',
          entityType: 'INVOICE',
          entityId: invoice.id,
          details: JSON.stringify({
            bookingId,
            invoiceNumber,
            itemCount: unbilled.length,
            amount,
          }),
        },
      });

      return invoice;
    }),
    );

    return NextResponse.json(
      {
        id: result.id,
        invoiceNumber: result.invoiceNumber,
        amount: toNumber(result.amount as never),
        status: result.status,
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (msg === 'NOTHING_TO_INVOICE' || msg === 'SEQUENCE_FAILED') {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
