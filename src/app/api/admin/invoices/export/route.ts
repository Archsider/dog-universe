import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { getMonthlyInvoicesWhere } from '@/lib/billing';
// Shared CSV escaper — see src/lib/csv.ts for the safety contract.
import { escapeCsv, UTF8_BOM } from '@/lib/csv';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  CARD: 'Carte bancaire',
  CHECK: 'Chèque',
  TRANSFER: 'Virement bancaire',
};

const SERVICE_LABELS: Record<string, string> = {
  BOARDING: 'Pension',
  PET_TAXI: 'Taxi animalier',
};

const CATEGORY_LABELS: Record<string, string> = {
  BOARDING: 'Pension',
  PET_TAXI: 'Pet Taxi',
  GROOMING: 'Toilettage',
  PRODUCT:  'Croquettes',
  OTHER:    'Autre',
  DISCOUNT: 'Remise',
};

// Cursor batch size. At 500 invoices per query, a 50k-invoice month
// streams in 100 round-trips with bounded memory (~5 MB peak instead
// of loading 50k×{client+booking+payments+items} into one heap).
const BATCH_SIZE = 500;
// Hard safety cap to avoid runaway in adversarial cases. Adjust upward
// when business needs justify.
const MAX_ROWS = 200_000;

export async function GET(request: Request) {
  const authResult = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (authResult.error) return authResult.error;

  const { searchParams } = new URL(request.url);

  const VALID_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];
  const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'];
  const VALID_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER', 'DISCOUNT'];

  const status = searchParams.get('status') || '';
  const year = searchParams.get('year') || '';
  const search = (searchParams.get('search') || '').trim();
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const paymentMethod = searchParams.get('paymentMethod') || '';
  const category = searchParams.get('category') || '';
  const amountMin = (searchParams.get('amountMin') || '').trim();
  const amountMax = (searchParams.get('amountMax') || '').trim();
  const clientId = (searchParams.get('clientId') || '').trim();

  const dateFromParsed = dateFrom ? new Date(dateFrom) : null;
  const dateToParsed = dateTo ? new Date(dateTo + 'T23:59:59.999Z') : null;
  const dateFromValid = dateFromParsed && !isNaN(dateFromParsed.getTime()) ? dateFromParsed : null;
  const dateToValid = dateToParsed && !isNaN(dateToParsed.getTime()) ? dateToParsed : null;

  const amountMinParsed = amountMin !== '' ? parseFloat(amountMin) : NaN;
  const amountMaxParsed = amountMax !== '' ? parseFloat(amountMax) : NaN;
  const amountMinValid = !isNaN(amountMinParsed) && amountMinParsed >= 0 ? amountMinParsed : null;
  const amountMaxValid = !isNaN(amountMaxParsed) && amountMaxParsed >= 0 ? amountMaxParsed : null;

  // Source de vérité comptable : si dateFrom/dateTo correspondent à une fenêtre,
  // on utilise getMonthlyInvoicesWhere() pour aligner liste exportée + KPIs.
  // Fallback legacy `year` → fenêtre annuelle via le même filtre.
  let monthRangeWhere: Record<string, unknown> | null = null;
  if (dateFromValid && dateToValid) {
    monthRangeWhere = getMonthlyInvoicesWhere(dateFromValid, dateToValid) as Record<string, unknown>;
  } else if (year) {
    const y = parseInt(year);
    if (!isNaN(y)) {
      monthRangeWhere = getMonthlyInvoicesWhere(
        new Date(`${y}-01-01T00:00:00.000Z`),
        new Date(`${y}-12-31T23:59:59.999Z`),
      ) as Record<string, unknown>;
    }
  }

  const amountFilter: Record<string, number> = {};
  if (amountMinValid !== null) amountFilter.gte = amountMinValid;
  if (amountMaxValid !== null) amountFilter.lte = amountMaxValid;

  const where: Record<string, unknown> = {
    ...(monthRangeWhere ?? {}),
    ...(status && VALID_STATUSES.includes(status) ? { status } : {}),
    ...(clientId ? { clientId } : {}),
    ...(search
      ? {
          OR: [
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
            { clientDisplayName: { contains: search, mode: 'insensitive' } },
            { client: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(paymentMethod && VALID_PAYMENT_METHODS.includes(paymentMethod) ? { payments: { some: { paymentMethod } } } : {}),
    ...(category && VALID_CATEGORIES.includes(category) ? { items: { some: { category } } } : {}),
    ...(Object.keys(amountFilter).length ? { amount: amountFilter } : {}),
  };

  const headers = [
    'N° Facture',
    'Client',
    'Email',
    'Téléphone',
    'Date émission',
    'Date paiement',
    'Mode de paiement',
    'Montant total (MAD)',
    'Montant réglé (MAD)',
    'Restant (MAD)',
    'Statut',
    'Service',
    'Catégorie',
  ];

  type InvoiceRow = {
    id: string;
    invoiceNumber: string;
    amount: unknown;
    paidAmount: unknown;
    issuedAt: Date;
    paidAt: Date | null;
    status: string;
    client: { name: string | null; email: string | null; phone: string | null };
    booking: { serviceType: string } | null;
    payments: Array<{ paymentDate: Date; paymentMethod: string }>;
    items: Array<{ category: string; total: unknown }>;
  };

  function buildRow(inv: InvoiceRow): string {
    const remaining = Math.max(0, Number(inv.amount) - Number(inv.paidAmount));
    const lastPayment = inv.payments[0] ?? null;
    const paymentDateStr = lastPayment
      ? lastPayment.paymentDate.toISOString().slice(0, 10)
      : (inv.paidAt ? inv.paidAt.toISOString().slice(0, 10) : '');

    let dominantCategory = 'OTHER';
    if (inv.items.length > 0) {
      const dom = inv.items.reduce((best, it) => Number(it.total) > Number(best.total) ? it : best);
      dominantCategory = dom.category;
    }

    return [
      escapeCsv(inv.invoiceNumber),
      escapeCsv(inv.client.name),
      escapeCsv(inv.client.email),
      escapeCsv(inv.client.phone),
      escapeCsv(inv.issuedAt.toISOString().slice(0, 10)),
      escapeCsv(paymentDateStr),
      escapeCsv(lastPayment ? PAYMENT_LABELS[lastPayment.paymentMethod] ?? lastPayment.paymentMethod : ''),
      // eslint-disable-next-line dog-universe/no-money-tofixed -- OK: CSV cells need a raw "12.34" decimal string for spreadsheet parsing ; a localized "12,34 MAD" would break Excel SUM formulas.
      escapeCsv(Number(inv.amount).toFixed(2)),
      // eslint-disable-next-line dog-universe/no-money-tofixed -- OK: same — raw decimal cell for spreadsheet arithmetic.
      escapeCsv(Number(inv.paidAmount).toFixed(2)),
      // eslint-disable-next-line dog-universe/no-money-tofixed -- OK: same.
      escapeCsv(remaining.toFixed(2)),
      escapeCsv(inv.status === 'PAID' ? 'Payée' : inv.status === 'CANCELLED' ? 'Annulée' : inv.status === 'PARTIALLY_PAID' ? 'Partiel' : 'En attente'),
      escapeCsv(inv.booking ? SERVICE_LABELS[inv.booking.serviceType] ?? inv.booking.serviceType : ''),
      escapeCsv(CATEGORY_LABELS[dominantCategory] ?? dominantCategory),
    ].join(';');
  }

  // ── Stream cursor-based pagination ────────────────────────────────────
  // Strategy: keyset paging on `id` (cuid, lexicographic-stable), batch
  // size BATCH_SIZE. Each batch is serialized to CSV chunks and pushed
  // to the ReadableStream queue. Memory footprint = 1 batch at a time,
  // not the full result set. Bounded by MAX_ROWS for safety.
  //
  // Stable ordering: id ASC — newest cuids come last but the pagination
  // is deterministic which is what we need for keyset. The legacy non-
  // stream version ordered by issuedAt DESC ; we accept the change
  // because (a) keyset on id is the only way to avoid duplicate/missed
  // rows under concurrent writes, and (b) spreadsheet consumers re-sort
  // client-side anyway.
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Header line first.
        controller.enqueue(encoder.encode(UTF8_BOM + headers.join(';') + '\r\n'));

        let cursorId: string | undefined = undefined;
        let total = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const remainingCap = MAX_ROWS - total;
          if (remainingCap <= 0) break;
          const take = Math.min(BATCH_SIZE, remainingCap);

          const batch = (await prisma.invoice.findMany({
            where,
            include: {
              client: { select: { name: true, email: true, phone: true } },
              booking: { select: { serviceType: true } },
              payments: { orderBy: { paymentDate: 'desc' }, take: 1 },
              items: { select: { category: true, total: true } },
            },
            orderBy: { id: 'asc' },
            take,
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
          })) as unknown as InvoiceRow[];

          if (batch.length === 0) break;

          const chunk = batch.map(buildRow).join('\r\n') + '\r\n';
          controller.enqueue(encoder.encode(chunk));

          total += batch.length;
          cursorId = batch[batch.length - 1].id;

          if (batch.length < take) break;
        }

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const filename = `factures_doguniverse_${today}.csv`;

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
