import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { FileText, Download, FileDown, Eye, Pencil, Banknote, CreditCard, Receipt, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatMAD, getInvoiceStatusColor } from '@/lib/utils';
import PaymentModal from './PaymentModal';
import CreateStandaloneInvoiceModal from '@/components/admin/CreateStandaloneInvoiceModal';
import ResendInvoiceButton from '@/components/admin/ResendInvoiceButton';
import RecomputeAllocationsButton from '@/components/admin/RecomputeAllocationsButton';

interface PageProps {
  params: { locale: string };
  searchParams: { status?: string; page?: string };
}

export default async function AdminBillingPage({ params: { locale }, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/auth/login`);

  const VALID_STATUS_FILTERS = ['', 'PAID', 'PARTIALLY_PAID', 'PENDING', 'CANCELLED'];
  const rawStatus = searchParams.status || '';
  const status = VALID_STATUS_FILTERS.includes(rawStatus) ? rawStatus : '';
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { ...(status && { status }) };

  const [invoices, total, totalRevenue, allClients, paymentMethodStats] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, email: true } },
        booking: { select: { serviceType: true } },
      },
      orderBy: { issuedAt: 'desc' },
      skip,
      take: limit,
      // We need paymentMethod and paymentDate for display
    }),
    prisma.invoice.count({ where }),
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.user.findMany({ where: { role: 'CLIENT' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
    prisma.payment.groupBy({
      by: ['paymentMethod'],
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  const labels = {
    fr: {
      title: 'Facturation',
      all: 'Toutes',
      paid: 'Payées',
      partial: 'Partiellement',
      pending: 'En attente',
      totalRevenue: 'Revenu total encaissé',
      ref: 'Référence',
      client: 'Client',
      date: 'Date',
      total: 'Total',
      paid_col: 'Payé',
      remaining: 'Restant',
      status: 'Statut',
      noInvoices: 'Aucune facture',
    },
    en: {
      title: 'Billing',
      all: 'All',
      paid: 'Paid',
      partial: 'Partial',
      pending: 'Pending',
      totalRevenue: 'Total revenue collected',
      ref: 'Reference',
      client: 'Client',
      date: 'Date',
      total: 'Total',
      paid_col: 'Paid',
      remaining: 'Remaining',
      status: 'Status',
      noInvoices: 'No invoices',
    },
  };

  const isl: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', PARTIALLY_PAID: 'Partiel', PAID: 'Payée', CANCELLED: 'Annulée' },
    en: { PENDING: 'Pending', PARTIALLY_PAID: 'Partial', PAID: 'Paid', CANCELLED: 'Cancelled' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const statusLbls = isl[locale] || isl.fr;

  const statusFilters = [
    { value: '', label: l.all },
    { value: 'PAID', label: l.paid },
    { value: 'PARTIALLY_PAID', label: l.partial },
    { value: 'PENDING', label: l.pending },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
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
          <RecomputeAllocationsButton locale={locale} />
          <CreateStandaloneInvoiceModal clients={allClients} locale={locale} />
        </div>
      </div>

      {/* Payment method breakdown */}
      {paymentMethodStats.length > 0 && (() => {
        const METHOD_CONFIG: Record<string, { Icon: typeof Banknote; color: string; bg: string; bar: string; labelFr: string; labelEn: string }> = {
          CASH:     { Icon: Banknote,   color: 'text-green-700',  bg: 'bg-green-50',   bar: 'bg-green-400',   labelFr: 'Espèces',     labelEn: 'Cash' },
          CARD:     { Icon: CreditCard, color: 'text-blue-700',   bg: 'bg-blue-50',    bar: 'bg-blue-400',    labelFr: 'TPE / Carte', labelEn: 'Card / POS' },
          CHECK:    { Icon: Receipt,    color: 'text-purple-700', bg: 'bg-purple-50',  bar: 'bg-purple-400',  labelFr: 'Chèque',      labelEn: 'Check' },
          TRANSFER: { Icon: Building2,  color: 'text-indigo-700', bg: 'bg-indigo-50',  bar: 'bg-indigo-400',  labelFr: 'Virement',    labelEn: 'Transfer' },
        };
        const totalPaid = paymentMethodStats.reduce((s, r) => s + (r._sum.amount ?? 0), 0) || 1;
        return (
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {locale === 'fr' ? 'Répartition des encaissements' : 'Payment breakdown'}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {(['CASH', 'CARD', 'CHECK', 'TRANSFER'] as const).map(method => {
                const stat = paymentMethodStats.find(s => s.paymentMethod === method);
                const amount = stat?._sum.amount ?? 0;
                const count = stat?._count.id ?? 0;
                const pct = Math.round((amount / totalPaid) * 100);
                const cfg = METHOD_CONFIG[method];
                return (
                  <div key={method} className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                        <cfg.Icon className={`h-4 w-4 ${cfg.color}`} />
                      </div>
                      <span className="text-sm font-semibold text-charcoal">
                        {locale === 'fr' ? cfg.labelFr : cfg.labelEn}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-charcoal">{formatMAD(amount)}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-400">{count} {locale === 'fr' ? 'paiement(s)' : 'payment(s)'}</p>
                      <span className={`text-xs font-semibold ${cfg.color}`}>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full mt-2">
                      <div className={`h-1.5 rounded-full transition-all ${cfg.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="flex gap-2 mb-4 flex-wrap">
        {statusFilters.map(f => (
          <Link key={f.value} href={`?status=${f.value}`}>
            <button className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              status === f.value ? 'bg-charcoal text-white' : 'bg-white border border-ivory-200 text-gray-600 hover:border-gold-300'
            }`}>{f.label}</button>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        {invoices.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{l.noInvoices}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ivory-200 bg-ivory-50">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{l.ref}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">{l.client}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">{l.date}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">{l.total}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">{l.paid_col}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">{l.remaining}</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">{l.status}</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const remaining = Math.max(0, inv.amount - inv.paidAmount);
                  return (
                    <tr key={inv.id} className="border-b border-ivory-100 last:border-0 hover:bg-ivory-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-semibold text-charcoal">{inv.invoiceNumber}</span>
                        {(inv.booking || inv.serviceType) && (
                          <p className="text-xs text-gray-400">
                            {inv.serviceType === 'PRODUCT_SALE'
                              ? (locale === 'fr' ? 'Croquettes / Produits' : 'Croquettes / Products')
                              : inv.booking?.serviceType === 'BOARDING'
                                ? (locale === 'fr' ? 'Pension' : 'Boarding')
                                : inv.booking?.serviceType === 'PET_TAXI'
                                  ? (locale === 'fr' ? 'Taxi animalier' : 'Pet Taxi')
                                  : inv.booking?.serviceType ?? ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Link href={`/${locale}/admin/clients/${inv.client.id}`} className="text-sm text-charcoal hover:text-gold-600">
                          {inv.clientDisplayName ?? inv.client.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{formatDate(inv.issuedAt, locale)}</td>
                      <td className="px-4 py-3 text-right font-bold text-charcoal">{formatMAD(inv.amount)}</td>
                      <td className="px-4 py-3 text-right text-sm hidden lg:table-cell">
                        {inv.paidAmount > 0 ? (
                          <span className="text-green-700 font-medium">{formatMAD(inv.paidAmount)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm hidden lg:table-cell">
                        {remaining > 0 ? (
                          <span className="text-orange-600 font-medium">{formatMAD(remaining)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={`text-xs ${getInvoiceStatusColor(inv.status)}`}>{statusLbls[inv.status] || inv.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Link href={`/${locale}/admin/invoices/${inv.id}`} title={locale === 'fr' ? 'Fiche facture' : 'Invoice details'} className="p-1.5 text-gray-400 hover:text-gold-600 rounded">
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <a href={`/api/invoices/${inv.id}/pdf?view=1`} target="_blank" rel="noopener noreferrer" title={locale === 'fr' ? 'Aperçu' : 'Preview'} className="p-1.5 text-gray-400 hover:text-gold-600 rounded">
                            <Eye className="h-4 w-4" />
                          </a>
                          <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer" title={locale === 'fr' ? 'Télécharger' : 'Download'} className="p-1.5 text-gray-400 hover:text-gold-600 rounded">
                            <Download className="h-4 w-4" />
                          </a>
                          <ResendInvoiceButton invoiceId={inv.id} locale={locale} />
                          <PaymentModal
                            invoiceId={inv.id}
                            currentStatus={inv.status}
                            locale={locale}
                            invoiceAmount={inv.amount}
                            paidAmount={inv.paidAmount}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-sm text-gray-400 text-center mt-4">{total} {locale === 'fr' ? 'facture(s)' : 'invoice(s)'}</div>
    </div>
  );
}
