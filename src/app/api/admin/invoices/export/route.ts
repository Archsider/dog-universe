import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Neutralise les formules CSV (Excel/LibreOffice formula injection)
  const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (sanitized.includes(';') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

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
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);

  const VALID_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];
  const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'];
  const VALID_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER'];

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

  const issuedAtFilter: Record<string, Date> = {};
  if (dateFromValid) issuedAtFilter.gte = dateFromValid;
  if (dateToValid) issuedAtFilter.lte = dateToValid;
  // Fallback legacy: if no explicit date range, honour `year` param
  if (!Object.keys(issuedAtFilter).length && year) {
    const y = parseInt(year);
    if (!isNaN(y)) {
      issuedAtFilter.gte = new Date(`${y}-01-01`);
      issuedAtFilter.lte = new Date(`${y}-12-31T23:59:59.999Z`);
    }
  }

  const amountFilter: Record<string, number> = {};
  if (amountMinValid !== null) amountFilter.gte = amountMinValid;
  if (amountMaxValid !== null) amountFilter.lte = amountMaxValid;

  const where: Record<string, unknown> = {
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
    ...(Object.keys(issuedAtFilter).length ? { issuedAt: issuedAtFilter } : {}),
    ...(paymentMethod && VALID_PAYMENT_METHODS.includes(paymentMethod) ? { payments: { some: { paymentMethod } } } : {}),
    ...(category && VALID_CATEGORIES.includes(category) ? { items: { some: { category } } } : {}),
    ...(Object.keys(amountFilter).length ? { amount: amountFilter } : {}),
  };

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      client: { select: { name: true, email: true, phone: true } },
      booking: { select: { serviceType: true } },
      payments: { orderBy: { paymentDate: 'desc' }, take: 1 },
      items: { select: { category: true, total: true } },
    },
    orderBy: { issuedAt: 'desc' },
  });

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

  const rows = invoices.map(inv => {
    const remaining = Math.max(0, inv.amount - inv.paidAmount);
    // Most recent payment's date/method
    const lastPayment = inv.payments[0] ?? null;
    const paymentDateStr = lastPayment
      ? lastPayment.paymentDate.toISOString().slice(0, 10)
      : (inv.paidAt ? inv.paidAt.toISOString().slice(0, 10) : '');

    // Dominant category = item with highest `total` (fallback OTHER)
    let dominantCategory = 'OTHER';
    if (inv.items.length > 0) {
      const dom = inv.items.reduce((best, it) => it.total > best.total ? it : best);
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
      escapeCsv(inv.amount.toFixed(2)),
      escapeCsv(inv.paidAmount.toFixed(2)),
      escapeCsv(remaining.toFixed(2)),
      escapeCsv(inv.status === 'PAID' ? 'Payée' : inv.status === 'CANCELLED' ? 'Annulée' : inv.status === 'PARTIALLY_PAID' ? 'Partiel' : 'En attente'),
      escapeCsv(inv.booking ? SERVICE_LABELS[inv.booking.serviceType] ?? inv.booking.serviceType : ''),
      escapeCsv(CATEGORY_LABELS[dominantCategory] ?? dominantCategory),
    ];
  });

  const csv =
    '\uFEFF' + // BOM for Excel
    [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');

  const today = new Date().toISOString().slice(0, 10);
  const filename = `factures_doguniverse_${today}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
