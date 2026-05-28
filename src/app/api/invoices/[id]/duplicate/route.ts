import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { casablancaYMD } from '@/lib/dates-casablanca';

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/invoices/[id]/duplicate — clone a source invoice's line items into
 * a brand-new PENDING invoice (fresh number, today's date, zero payments). The
 * duplicate is STANDALONE: it never re-links to the source's booking (that
 * would double-attach) and copies no payments/paidAt. Returns the new id so the
 * UI can navigate to it for editing.
 */
export async function POST(_req: Request, { params }: Params) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;

  const source = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, role: true } },
      items: { orderBy: { id: 'asc' } },
    },
  });
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Cross-role: ADMIN can only act on CLIENT-owned invoices; SUPERADMIN passes.
  if (session.user.role === 'ADMIN' && source.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  if (source.items.length === 0) {
    return NextResponse.json({ error: 'NO_ITEMS' }, { status: 400 });
  }

  // Fresh invoice number via the InvoiceSequence row-lock (same pattern as
  // POST /api/invoices). Retry on a legacy-number collision.
  const year = casablancaYMD().year;
  let invoiceNumber = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const seqRow = await prisma.$queryRaw<{ lastSeq: number }[]>`
      INSERT INTO "InvoiceSequence" (year, "lastSeq")
      VALUES (${year}, 1)
      ON CONFLICT (year)
      DO UPDATE SET "lastSeq" = "InvoiceSequence"."lastSeq" + 1
      RETURNING "lastSeq"
    `;
    const seq = seqRow[0]?.lastSeq;
    if (typeof seq !== 'number') break;
    const candidate = `DU-${year}-${String(seq).padStart(4, '0')}`;
    const exists = await prisma.invoice.findUnique({ where: { invoiceNumber: candidate } });
    if (!exists) { invoiceNumber = candidate; break; }
  }
  if (!invoiceNumber) {
    return NextResponse.json({ error: 'Could not generate invoice number' }, { status: 500 });
  }

  const now = new Date();
  const created = await prisma.invoice.create({
    data: {
      invoiceNumber,
      clientId: source.clientId,
      // Standalone — no bookingId, no supplementaryForBookingId, no payments.
      clientDisplayName: source.clientDisplayName,
      clientDisplayPhone: source.clientDisplayPhone,
      clientDisplayEmail: source.clientDisplayEmail,
      serviceType: source.serviceType,
      // The trigger recomputes amount = SUM(items.total) once items land; seed
      // with the source amount so the row is valid pre-trigger.
      amount: source.amount,
      paidAmount: 0,
      status: 'PENDING',
      issuedAt: now,
      periodDate: now,
      notes: source.notes,
      items: {
        create: source.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
          category: it.category,
          ...(it.productId ? { productId: it.productId } : {}),
        })),
      },
    },
    select: { id: true, invoiceNumber: true },
  });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.INVOICE_DUPLICATED,
    entityType: 'Invoice',
    entityId: created.id,
    details: { duplicatedFrom: source.invoiceNumber, newInvoiceNumber: created.invoiceNumber },
  });

  return NextResponse.json({ id: created.id, invoiceNumber: created.invoiceNumber }, { status: 201 });
}
