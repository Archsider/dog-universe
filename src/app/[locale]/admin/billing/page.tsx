import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { FileText, Download, FileDown, Eye, Pencil, Search, X } from 'lucide-react';
import { formatDate, formatMAD } from '@/lib/utils';
import PaymentModal from './PaymentModal';
import CreateStandaloneInvoiceModal from '@/components/admin/CreateStandaloneInvoiceModal';
import ResendInvoiceButton from '@/components/admin/ResendInvoiceButton';
import RecomputeAllocationsButton from '@/components/admin/RecomputeAllocationsButton';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    status?: string;
    page?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    paymentMethod?: string;
    category?: string;
    amountMin?: string;
    amountMax?: string;
    sort?: string;
    order?: string;
    clientId?: string;
  }>;
}

export default async function AdminBillingPage(props: PageProps) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/auth/login`);

  const VALID_STATUS_FILTERS = ['', 'PAID', 'PARTIALLY_PAID', 'PENDING', 'CANCELLED'];
  const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'];
  const VALID_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER'];
  const VALID_SORTS = ['reference', 'client', 'date', 'total', 'paid', 'remaining'];
  const VALID_ORDERS = ['asc', 'desc'];

  const rawStatus = searchParams.status || '';
  const status = VALID_STATUS_FILTERS.includes(rawStatus) ? rawStatus : '';
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const skip = (page - 1) * limit;

  const search = (searchParams.search || '').trim();
  const dateFrom = searchParams.dateFrom || '';
  const dateTo = searchParams.dateTo || '';
  const rawPaymentMethod = searchParams.paymentMethod || '';
  const paymentMethod = VALID_PAYMENT_METHODS.includes(rawPaymentMethod) ? rawPaymentMethod : '';
  const rawCategory = searchParams.category || '';
  const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : '';
  const amountMin = (searchParams.amountMin || '').trim();
  const amountMax = (searchParams.amountMax || '').trim();
  const amountMinParsed = amountMin !== '' ? parseFloat(amountMin) : NaN;
  const amountMaxParsed = amountMax !== '' ? parseFloat(amountMax) : NaN;
  const amountMinValid = !isNaN(amountMinParsed) && amountMinParsed >= 0 ? amountMinParsed : null;
  const amountMaxValid = !isNaN(amountMaxParsed) && amountMaxParsed >= 0 ? amountMaxParsed : null;
  const rawSort = searchParams.sort || '';
  const sort = VALID_SORTS.includes(rawSort) ? rawSort : '';
  const rawOrder = searchParams.order || '';
  const order = (VALID_ORDERS.includes(rawOrder) ? rawOrder : 'desc') as 'asc' | 'desc';
  const clientId = (searchParams.clientId || '').trim();

  // Parse date filters safely — invalid dates are ignored
  const dateFromParsed = dateFrom ? new Date(dateFrom) : null;
  const dateToParsed = dateTo ? new Date(dateTo + 'T23:59:59.999Z') : null;
  const dateFromValid = dateFromParsed && !isNaN(dateFromParsed.getTime()) ? dateFromParsed : null;
  const dateToValid = dateToParsed && !isNaN(dateToParsed.getTime()) ? dateToParsed : null;

  const issuedAtFilter: Record<string, Date> = {};
  if (dateFromValid) issuedAtFilter.gte = dateFromValid;
  if (dateToValid) issuedAtFilter.lte = dateToValid;

  const amountFilter: Record<string, number> = {};
  if (amountMinValid !== null) amountFilter.gte = amountMinValid;
  if (amountMaxValid !== null) amountFilter.lte = amountMaxValid;

  const where: Record<string, unknown> = {
    ...(status ? { status } : {}),
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
    ...(paymentMethod ? { payments: { some: { paymentMethod } } } : {}),
    ...(category ? { items: { some: { category } } } : {}),
    ...(Object.keys(amountFilter).length ? { amount: amountFilter } : {}),
  };

  // Dynamic orderBy — remaining uses `amount` as approximation (Prisma can't order by computed field)
  const orderByMap: Record<string, Record<string, 'asc' | 'desc'>> = {
    reference: { invoiceNumber: order },
    client:    { clientDisplayName: order },
    date:      { issuedAt: order },
    total:     { amount: order },
    paid:      { paidAmount: order },
    remaining: { amount: order },
  };
  const orderBy = sort ? orderByMap[sort] : { issuedAt: 'desc' as const };

  // Stat cards respect the same filters as the table (date range + invoice filters)
  const paymentDateFilter: Record<string, Date> = {};
  if (dateFromValid) paymentDateFilter.gte = dateFromValid;
  if (dateToValid) paymentDateFilter.lte = dateToValid;
  const paymentStatsWhere = Object.keys(paymentDateFilter).length
    ? { paymentDate: paymentDateFilter }
    : undefined;

  // Extended stats where — includes invoice filters via relation
  const paymentStatsWhereFull: Record<string, unknown> = {};
  if (Object.keys(paymentDateFilter).length) paymentStatsWhereFull.paymentDate = paymentDateFilter;
  if (Object.keys(where).length) paymentStatsWhereFull.invoice = where;
  const paymentStatsWhereOrUndef = Object.keys(paymentStatsWhereFull).length
    ? paymentStatsWhereFull
    : undefined;

  const [invoices, total, totalRevenue, allClients, paymentMethodStats, totalUnfiltered] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, email: true } },
        booking: { select: { serviceType: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.invoice.count({ where }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: paymentStatsWhere }),
    prisma.user.findMany({ where: { role: 'CLIENT' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }),
    prisma.payment.groupBy({
      by: ['paymentMethod'],
      _sum: { amount: true },
      _count: { id: true },
      where: paymentStatsWhereOrUndef,
    }),
    prisma.invoice.count(),
  ]);

  const activeFiltersCount =
    (search ? 1 : 0) +
    (dateFromValid ? 1 : 0) +
    (dateToValid ? 1 : 0) +
    (paymentMethod ? 1 : 0) +
    (category ? 1 : 0) +
    (amountMinValid !== null ? 1 : 0) +
    (amountMaxValid !== null ? 1 : 0) +
    (clientId ? 1 : 0);

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
    { value: 'CANCELLED', label: locale === 'fr' ? 'Annulées' : 'Cancelled' },
  ];

  const methodOptions = [
    { value: '',         fr: 'Tous les moyens',  en: 'All methods' },
    { value: 'CASH',     fr: 'Espèces',          en: 'Cash' },
    { value: 'CARD',     fr: 'TPE / Carte',      en: 'Card / POS' },
    { value: 'CHECK',    fr: 'Chèque',           en: 'Check' },
    { value: 'TRANSFER', fr: 'Virement',         en: 'Transfer' },
  ];

  const categoryOptions = [
    { value: '',         fr: 'Toutes catégories', en: 'All categories' },
    { value: 'BOARDING', fr: '🏠 Pension',        en: '🏠 Boarding' },
    { value: 'PET_TAXI', fr: '🚗 Pet Taxi',       en: '🚗 Pet Taxi' },
    { value: 'GROOMING', fr: '✂️ Toilettage',     en: '✂️ Grooming' },
    { value: 'PRODUCT',  fr: '🐾 Croquettes',     en: '🐾 Kibbles' },
    { value: 'OTHER',    fr: '➕ Autre',          en: '➕ Other' },
  ];

  // Query-string builder preserving all active filters; overrides are merged last.
  const buildQS = (overrides: Record<string, string | null | undefined>): string => {
    const base: Record<string, string> = {};
    if (status) base.status = status;
    if (search) base.search = search;
    if (dateFrom) base.dateFrom = dateFrom;
    if (dateTo) base.dateTo = dateTo;
    if (paymentMethod) base.paymentMethod = paymentMethod;
    if (category) base.category = category;
    if (amountMin) base.amountMin = amountMin;
    if (amountMax) base.amountMax = amountMax;
    if (sort) base.sort = sort;
    if (order && order !== 'desc') base.order = order;
    if (clientId) base.clientId = clientId;
    const merged = { ...base, ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v === '' || v === null || v === undefined) continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return qs ? '?' + qs : '';
  };

  const SORT_COLS: { key: string; label: string; align: 'left' | 'right' }[] = [
    { key: 'reference', label: l.ref,       align: 'left'  },
    { key: 'client',    label: l.client,    align: 'left'  },
    { key: 'date',      label: l.date,      align: 'left'  },
    { key: 'total',     label: l.total,     align: 'right' },
    { key: 'paid',      label: l.paid_col,  align: 'right' },
    { key: 'remaining', label: l.remaining, align: 'right' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-[#2A2520]">{l.title}</h1>
          <p className="text-sm text-[#8A7E75] mt-1">
            {locale === 'fr' ? 'Répartition des encaissements' : 'Payment breakdown'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-[#8A7E75] font-semibold">{l.totalRevenue}</div>
            <div className="text-lg font-bold text-[#C4974A]">{formatMAD(totalRevenue._sum.amount || 0)}</div>
          </div>
          <a
            href={(() => {
              const exportParams = new URLSearchParams();
              if (status) exportParams.set('status', status);
              if (search) exportParams.set('search', search);
              if (dateFrom) exportParams.set('dateFrom', dateFrom);
              if (dateTo) exportParams.set('dateTo', dateTo);
              if (paymentMethod) exportParams.set('paymentMethod', paymentMethod);
              if (category) exportParams.set('category', category);
              if (amountMin) exportParams.set('amountMin', amountMin);
              if (amountMax) exportParams.set('amountMax', amountMax);
              if (clientId) exportParams.set('clientId', clientId);
              const qs = exportParams.toString();
              return `/api/admin/invoices/export${qs ? '?' + qs : ''}`;
            })()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-white border border-[#C4974A] text-[#C4974A] hover:bg-[#C4974A] hover:text-white rounded-lg transition-all duration-300"
            title={locale === 'fr' ? 'Exporter en CSV' : 'Export CSV'}
          >
            <FileDown className="h-3.5 w-3.5" />
            Export CSV
          </a>
          <RecomputeAllocationsButton locale={locale} />
          <CreateStandaloneInvoiceModal clients={allClients} locale={locale} />
        </div>
      </div>

      {/* Payment method breakdown */}
      {paymentMethodStats.length > 0 && (() => {
        const METHOD_CONFIG: Record<string, { labelFr: string; labelEn: string; svg: React.ReactNode }> = {
          CASH: {
            labelFr: 'Espèces', labelEn: 'Cash',
            svg: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="2" y="6" width="20" height="12" rx="1.5" />
                <circle cx="12" cy="12" r="3" />
                <path d="M 4.5 8.5 L 4.5 9.2 M 19.5 14.8 L 19.5 15.5" />
              </svg>
            ),
          },
          CARD: {
            labelFr: 'TPE / Carte', labelEn: 'Card / POS',
            svg: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="9.5" x2="22" y2="9.5" />
                <rect x="5" y="13" width="4" height="3" rx="0.5" />
              </svg>
            ),
          },
          CHECK: {
            labelFr: 'Chèque', labelEn: 'Check',
            svg: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="3" y="4" width="18" height="16" rx="1.5" />
                <line x1="6" y1="9" x2="18" y2="9" />
                <line x1="6" y1="12" x2="14" y2="12" />
                <path d="M 6 16.5 Q 9 14.5, 12 16.5 T 18 16.5" />
              </svg>
            ),
          },
          TRANSFER: {
            labelFr: 'Virement', labelEn: 'Transfer',
            svg: (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="3" y="4" width="18" height="16" rx="1.5" />
                <path d="M 7 10 L 15 10 M 13 8 L 15 10 L 13 12" />
                <path d="M 17 14 L 9 14 M 11 12 L 9 14 L 11 16" />
              </svg>
            ),
          },
        };
        const totalPaid = paymentMethodStats.reduce((s, r) => s + (r._sum.amount ?? 0), 0) || 1;
        return (
          <div className="mb-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(['CASH', 'CARD', 'CHECK', 'TRANSFER'] as const).map(method => {
                const stat = paymentMethodStats.find(s => s.paymentMethod === method);
                const amount = stat?._sum.amount ?? 0;
                const count = stat?._count.id ?? 0;
                const pct = Math.round((amount / totalPaid) * 100);
                const cfg = METHOD_CONFIG[method];
                return (
                  <div
                    key={method}
                    className="bg-white rounded-xl border-[1.5px] border-[#C4974A] p-5 transition-all duration-300 hover:shadow-md hover:shadow-[#C4974A]/20"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg border-[1.5px] border-[#C4974A] text-[#C4974A] flex items-center justify-center flex-shrink-0">
                        {cfg.svg}
                      </div>
                      <span className="text-sm font-semibold text-[#2A2520]">
                        {locale === 'fr' ? cfg.labelFr : cfg.labelEn}
                      </span>
                    </div>
                    <p className="text-2xl font-serif font-bold text-[#2A2520]">{formatMAD(amount)}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-[#8A7E75]">{count} {locale === 'fr' ? 'paiement(s)' : 'payment(s)'}</p>
                      <span className="text-xs font-bold text-[#C4974A]">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#C4974A]/10 rounded-full mt-3 overflow-hidden">
                      <div className="h-1.5 rounded-full bg-[#C4974A] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Filtres CRM : search + date + méthode + catégorie + montant */}
      <form action="" method="GET" className="mb-5 space-y-3">
        {/* Preserve other params on submit */}
        {status && <input type="hidden" name="status" value={status} />}
        {sort && <input type="hidden" name="sort" value={sort} />}
        {order && order !== 'desc' && <input type="hidden" name="order" value={order} />}
        {clientId && <input type="hidden" name="clientId" value={clientId} />}

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A7E75] pointer-events-none" />
          <input
            name="search"
            defaultValue={search}
            placeholder={locale === 'fr' ? 'Rechercher par référence, client...' : 'Search by reference, client...'}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#C4974A] rounded-lg text-sm text-[#2A2520] placeholder:text-[#8A7E75] focus:outline-none focus:border-[#C4974A] focus:ring-2 focus:ring-[#C4974A]/15 transition"
          />
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <label className="text-xs text-[#8A7E75]">
            {locale === 'fr' ? 'Du' : 'From'}
            <input
              type="date"
              name="dateFrom"
              defaultValue={dateFrom}
              className="ml-2 px-3 py-1.5 bg-white border border-[#C4974A] rounded-lg text-sm text-[#2A2520] focus:outline-none focus:ring-2 focus:ring-[#C4974A]/15"
            />
          </label>
          <label className="text-xs text-[#8A7E75]">
            {locale === 'fr' ? 'Au' : 'To'}
            <input
              type="date"
              name="dateTo"
              defaultValue={dateTo}
              className="ml-2 px-3 py-1.5 bg-white border border-[#C4974A] rounded-lg text-sm text-[#2A2520] focus:outline-none focus:ring-2 focus:ring-[#C4974A]/15"
            />
          </label>
          <select
            name="paymentMethod"
            defaultValue={paymentMethod}
            className="px-3 py-1.5 bg-white border border-[#C4974A] rounded-lg text-sm text-[#2A2520] focus:outline-none focus:ring-2 focus:ring-[#C4974A]/15"
          >
            {methodOptions.map(m => (
              <option key={m.value} value={m.value}>
                {locale === 'fr' ? m.fr : m.en}
              </option>
            ))}
          </select>
          <select
            name="category"
            defaultValue={category}
            className="px-3 py-1.5 bg-white border border-[#C4974A] rounded-lg text-sm text-[#2A2520] focus:outline-none focus:ring-2 focus:ring-[#C4974A]/15"
          >
            {categoryOptions.map(c => (
              <option key={c.value} value={c.value}>
                {locale === 'fr' ? c.fr : c.en}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#C4974A] text-white border border-[#C4974A] hover:bg-[#A67F38] transition-colors"
          >
            {locale === 'fr' ? 'Appliquer' : 'Apply'}
          </button>
          {activeFiltersCount > 0 && (
            <Link
              href="?"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#8A7E75] border border-[rgba(196,151,74,0.3)] hover:border-[#C4974A] hover:text-[#C4974A] transition-colors"
            >
              <X className="h-3 w-3" />
              {locale === 'fr' ? 'Réinitialiser' : 'Reset'}
            </Link>
          )}
          {activeFiltersCount > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#C4974A]/10 text-[#C4974A] border border-[#C4974A]/30">
              {activeFiltersCount} {locale === 'fr'
                ? (activeFiltersCount > 1 ? 'filtres actifs' : 'filtre actif')
                : (activeFiltersCount > 1 ? 'active filters' : 'active filter')}
            </span>
          )}
        </div>

        {/* Row montant min/max */}
        <div className="flex gap-2 flex-wrap items-center">
          <label className="text-sm text-[#8A7E75]">
            {locale === 'fr' ? 'Montant' : 'Amount'}
          </label>
          <input
            type="number"
            name="amountMin"
            defaultValue={amountMin}
            placeholder={locale === 'fr' ? 'Min MAD' : 'Min MAD'}
            min="0"
            step="0.01"
            className="w-28 px-3 py-1.5 bg-white border border-[#C4974A] rounded-lg text-sm text-[#2A2520] focus:outline-none focus:ring-2 focus:ring-[#C4974A]/15"
          />
          <span className="text-[#8A7E75] text-sm">—</span>
          <input
            type="number"
            name="amountMax"
            defaultValue={amountMax}
            placeholder={locale === 'fr' ? 'Max MAD' : 'Max MAD'}
            min="0"
            step="0.01"
            className="w-28 px-3 py-1.5 bg-white border border-[#C4974A] rounded-lg text-sm text-[#2A2520] focus:outline-none focus:ring-2 focus:ring-[#C4974A]/15"
          />
        </div>
      </form>

      {/* Filter pills */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {statusFilters.map(f => {
          const active = status === f.value;
          return (
            <Link key={f.value} href={buildQS({ status: f.value || null, page: null })}>
              <button
                type="button"
                className={`px-5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 ${
                  active
                    ? 'bg-[#C4974A] text-white border-2 border-[#C4974A] shadow-sm'
                    : 'bg-white text-[#8A7E75] border border-[#C4974A] hover:bg-[#C4974A]/5 hover:text-[#C4974A]'
                }`}
              >
                {f.label}
              </button>
            </Link>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border-[1.5px] border-[#C4974A] overflow-hidden">
        {invoices.length === 0 ? (
          <div className="text-center py-16 text-[#8A7E75]">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{l.noInvoices}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="bg-[#FEFCF9] border-b border-[rgba(196,151,74,0.12)]">
                    {SORT_COLS.map(col => {
                      const isActive = sort === col.key;
                      const nextOrder = isActive && order === 'desc' ? 'asc' : 'desc';
                      const arrow = isActive ? (order === 'asc' ? '↑' : '↓') : '↕';
                      return (
                        <th
                          key={col.key}
                          className={`text-${col.align} text-[11px] font-semibold text-[#8A7E75] px-6 py-4 uppercase tracking-wider`}
                        >
                          <Link
                            href={buildQS({ sort: col.key, order: nextOrder, page: null })}
                            className={`inline-flex items-center gap-1 hover:text-[#C4974A] transition-colors ${isActive ? 'text-[#C4974A]' : ''}`}
                          >
                            {col.label}
                            <span className="text-[10px] opacity-60">{arrow}</span>
                          </Link>
                        </th>
                      );
                    })}
                    <th className="text-left text-[11px] font-semibold text-[#8A7E75] px-6 py-4 uppercase tracking-wider">{l.status}</th>
                    <th className="px-6 py-4" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const remaining = Math.max(0, inv.amount - inv.paidAmount);
                    const category = inv.serviceType === 'PRODUCT_SALE'
                      ? (locale === 'fr' ? 'Croquettes / Produits' : 'Croquettes / Products')
                      : inv.booking?.serviceType === 'BOARDING'
                        ? (locale === 'fr' ? 'Pension' : 'Boarding')
                        : inv.booking?.serviceType === 'PET_TAXI'
                          ? (locale === 'fr' ? 'Taxi animalier' : 'Pet Taxi')
                          : inv.booking?.serviceType ?? '';
                    const statusStyle =
                      inv.status === 'PAID'
                        ? { bg: '#EAF7EF', color: '#1A7A45', border: 'rgba(26,122,69,0.2)' }
                        : inv.status === 'PARTIALLY_PAID'
                          ? { bg: '#FEF3E2', color: '#B45309', border: 'rgba(180,83,9,0.2)' }
                          : inv.status === 'PENDING'
                            ? { bg: '#F0EFFE', color: '#5B4FCF', border: 'rgba(91,79,207,0.2)' }
                            : { bg: '#F5F5F5', color: '#6B6B6B', border: 'rgba(0,0,0,0.08)' };
                    const remainingColor =
                      inv.status === 'PARTIALLY_PAID' ? '#B45309'
                      : inv.status === 'PENDING' ? '#5B4FCF'
                      : '#8A7E75';
                    return (
                      <tr
                        key={inv.id}
                        className="border-b border-[rgba(196,151,74,0.08)] last:border-0 transition-all duration-300 hover:shadow-[inset_3px_0_0_#C4974A]"
                      >
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm font-bold text-[#9A7235]">{inv.invoiceNumber}</span>
                          {category && (
                            <p className="text-xs text-[#8A7E75] mt-0.5">{category}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Link href={`/${locale}/admin/clients/${inv.client.id}`} className="text-sm text-[#2A2520] hover:text-[#C4974A] transition-colors">
                            {inv.clientDisplayName ?? inv.client.name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#8A7E75]">{formatDate(inv.issuedAt, locale)}</td>
                        <td className="px-6 py-4 text-right text-[15px] font-bold text-[#2A2520]">{formatMAD(inv.amount)}</td>
                        <td className="px-6 py-4 text-right text-sm">
                          {inv.paidAmount > 0 ? (
                            <span className="text-[#1A7A45] font-semibold">{formatMAD(inv.paidAmount)}</span>
                          ) : (
                            <span className="text-[#8A7E75]/40">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-sm">
                          {remaining > 0 ? (
                            <span className="font-semibold" style={{ color: remainingColor }}>{formatMAD(remaining)}</span>
                          ) : (
                            <span className="text-[#8A7E75]/40">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={{ backgroundColor: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border }}
                          >
                            {statusLbls[inv.status] || inv.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <Link href={`/${locale}/admin/invoices/${inv.id}`} title={locale === 'fr' ? 'Fiche facture' : 'Invoice details'} className="p-1.5 text-[#8A7E75] hover:text-[#C4974A] rounded transition-colors">
                              <Pencil className="h-4 w-4" />
                            </Link>
                            <a href={`/api/invoices/${inv.id}/pdf?view=1`} target="_blank" rel="noopener noreferrer" title={locale === 'fr' ? 'Aperçu' : 'Preview'} className="p-1.5 text-[#8A7E75] hover:text-[#C4974A] rounded transition-colors">
                              <Eye className="h-4 w-4" />
                            </a>
                            <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer" title={locale === 'fr' ? 'Télécharger' : 'Download'} className="p-1.5 text-[#8A7E75] hover:text-[#C4974A] rounded transition-colors">
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
            <div className="px-6 py-4 border-t border-[rgba(196,151,74,0.12)] text-xs text-[#8A7E75]">
              {activeFiltersCount > 0 || status
                ? (locale === 'fr'
                    ? `${total} facture(s) trouvée(s) sur ${totalUnfiltered} au total`
                    : `${total} invoice(s) found out of ${totalUnfiltered} total`)
                : (locale === 'fr'
                    ? `${total} facture(s) trouvée(s)`
                    : `${total} invoice(s) found`)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
