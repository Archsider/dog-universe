import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { FileDown } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import BillingTable from './BillingTable';

interface PageProps {
  params: { locale: string };
  searchParams: { status?: string; page?: string };
}

export default async function AdminBillingPage({ params: { locale }, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const status = searchParams.status || '';
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { ...(status && { status }) };

  const [invoices, total, totalRevenue] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, email: true } },
        booking: { select: { serviceType: true } },
      },
      orderBy: { issuedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
  ]);

  const labels = {
    fr: {
      title: 'Facturation',
      all: 'Toutes',
      paid: 'Payées',
      pending: 'En attente',
      totalRevenue: 'Revenu total encaissé',
      ref: 'Référence',
      client: 'Client',
      date: 'Date',
      total: 'Total',
      status: 'Statut',
      noInvoices: 'Aucune facture',
    },
    en: {
      title: 'Billing',
      all: 'All',
      paid: 'Paid',
      pending: 'Pending',
      totalRevenue: 'Total revenue collected',
      ref: 'Reference',
      client: 'Client',
      date: 'Date',
      total: 'Total',
      status: 'Status',
      noInvoices: 'No invoices',
    },
  };

  const isl: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', PAID: 'Payée', CANCELLED: 'Annulée' },
    en: { PENDING: 'Pending', PAID: 'Paid', CANCELLED: 'Cancelled' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const statusLbls = isl[locale] || isl.fr;

  const statusFilters = [
    { value: '', label: l.all },
    { value: 'PAID', label: l.paid },
    { value: 'PENDING', label: l.pending },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-gray-400">{l.totalRevenue}</div>
            <div className="font-bold text-gold-600">{formatMAD(totalRevenue._sum.amount || 0)}</div>
          </div>
          <a
            href={`/api/admin/invoices/export?status=${status}&year=${new Date().getFullYear()}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-ivory-200 hover:border-gold-300 text-gray-600 hover:text-gold-700 rounded-lg font-medium transition-colors"
            title={locale === 'fr' ? 'Exporter en CSV' : 'Export CSV'}
          >
            <FileDown className="h-3.5 w-3.5" />
            {locale === 'fr' ? 'Export CSV' : 'Export CSV'}
          </a>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {statusFilters.map(f => (
          <Link key={f.value} href={`?status=${f.value}`}>
            <button className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              status === f.value ? 'bg-charcoal text-white' : 'bg-white border border-ivory-200 text-gray-600 hover:border-gold-300'
            }`}>{f.label}</button>
          </Link>
        ))}
      </div>

      <BillingTable invoices={invoices} locale={locale} statusLbls={statusLbls} noInvoices={l.noInvoices} />

      <div className="text-sm text-gray-400 text-center mt-4">{total} {locale === 'fr' ? 'facture(s)' : 'invoice(s)'}</div>
    </div>
  );
}
