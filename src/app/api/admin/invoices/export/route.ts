import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const year = searchParams.get('year');

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (year) {
    const y = parseInt(year);
    where.issuedAt = {
      gte: new Date(`${y}-01-01`),
      lte: new Date(`${y}-12-31T23:59:59`),
    };
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      client: { select: { name: true, email: true, phone: true } },
      booking: { select: { serviceType: true } },
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
    'Montant (MAD)',
    'Statut',
    'Service',
  ];

  const rows = invoices.map(inv => [
    escapeCsv(inv.invoiceNumber),
    escapeCsv(inv.client.name),
    escapeCsv(inv.client.email),
    escapeCsv(inv.client.phone),
    escapeCsv(inv.issuedAt.toISOString().slice(0, 10)),
    escapeCsv(inv.paidAt ? inv.paidAt.toISOString().slice(0, 10) : ''),
    escapeCsv(inv.paymentMethod ? PAYMENT_LABELS[inv.paymentMethod] ?? inv.paymentMethod : ''),
    escapeCsv(inv.amount.toFixed(2)),
    escapeCsv(inv.status === 'PAID' ? 'Payée' : inv.status === 'CANCELLED' ? 'Annulée' : 'En attente'),
    escapeCsv(inv.booking ? SERVICE_LABELS[inv.booking.serviceType] ?? inv.booking.serviceType : ''),
  ]);

  const csv =
    '\uFEFF' + // BOM for Excel
    [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');

  const filename = `factures_doguniverse_${year ?? new Date().getFullYear()}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
