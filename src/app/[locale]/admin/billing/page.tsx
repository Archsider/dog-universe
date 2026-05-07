import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { FileText, Download, Eye, Pencil } from 'lucide-react';
import { formatDate, formatMAD } from '@/lib/utils';
import { toNumber } from '@/lib/decimal';
import { getMonthlyInvoicesWhere } from '@/lib/billing';
import PaymentModal from './PaymentModal';
import CreateStandaloneInvoiceModal from '@/components/admin/CreateStandaloneInvoiceModal';
import ResendInvoiceButton from '@/components/admin/ResendInvoiceButton';
import RecomputeAllocationsButton from '@/components/admin/RecomputeAllocationsButton';
import { MonthNavigator, CsvDownloadButton } from './BillingClient';
import { formatMonthLabel } from './format-month';
import InvoiceHighlight from './InvoiceHighlight';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    month?: string;
    status?: string;
    page?: string;
    search?: string;
    paymentMethod?: string;
    category?: string;
    sort?: string;
    order?: string;
    clientId?: string;
    invoiceId?: string;
  }>;
}

const MONTH_NAMES_FR_LC = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function getCurrentYYYYMM(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonth(raw: string | undefined): string {
  if (!raw) return getCurrentYYYYMM();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return getCurrentYYYYMM();
}

function monthBounds(yyyyMm: string): { start: Date; end: Date } {
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

export default async function AdminBillingPage(props: PageProps) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const isFr = locale === 'fr';

  // ── Month ──────────────────────────────────────────────────────────────────
  const selectedMonth = parseMonth(searchParams.month);
  const { start: monthStart, end: monthEnd } = monthBounds(selectedMonth);
  const monthLabel = formatMonthLabel(selectedMonth, locale);

  // ── Filters (secondary, within the month) ─────────────────────────────────
  const VALID_STATUS_FILTERS = ['', 'PAID', 'PARTIALLY_PAID', 'PENDING', 'CANCELLED'];
  const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'];
  const VALID_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER'];
  const VALID_SORTS = ['reference', 'client', 'date', 'total', 'paid', 'remaining'];
  const VALID_ORDERS = ['asc', 'desc'];

  const rawStatus = searchParams.status || '';
  const status = VALID_STATUS_FILTERS.includes(rawStatus) ? rawStatus : '';
  const page = Math.max(1, parseInt(searchParams.page || '1'));
  const limit = 25;
  const skip = (page - 1) * limit;
  const search = (searchParams.search || '').trim();
  const rawPaymentMethod = searchParams.paymentMethod || '';
  const paymentMethod = VALID_PAYMENT_METHODS.includes(rawPaymentMethod) ? rawPaymentMethod : '';
  const rawCategory = searchParams.category || '';
  const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : '';
  const rawSort = searchParams.sort || '';
  const sort = VALID_SORTS.includes(rawSort) ? rawSort : '';
  const rawOrder = searchParams.order || '';
  const order = (VALID_ORDERS.includes(rawOrder) ? rawOrder : 'desc') as 'asc' | 'desc';
  const clientId = (searchParams.clientId || '').trim();
  // Highlight target invoice when navigating from a booking page.
  const highlightInvoiceId = (searchParams.invoiceId || '').trim();

  // Règle métier unique : SOURCE DE VÉRITÉ comptable = lib/billing.getMonthlyInvoicesWhere.
  // Une facture appartient au mois si (1) elle a un paiement ce mois, (2) le séjour est
  // actif ce mois sans paiement, ou (3) c'est une facture manuelle émise ce mois.
  // Filtre partagé entre liste + KPIs — jamais de divergence.
  const monthDateFilter = getMonthlyInvoicesWhere(monthStart, monthEnd);

  // Month-scoped where for the invoice list
  const listWhere: Record<string, unknown> = {
    ...monthDateFilter,
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
    ...(paymentMethod ? { payments: { some: { paymentMethod } } } : {}),
    ...(category ? { items: { some: { category } } } : {}),
  };

  // Unfiltered month where (for KPIs — no status/search/method/category filters)
  const monthWhere = monthDateFilter;

  // Dynamic orderBy
  const orderByMap: Record<string, Record<string, 'asc' | 'desc'>> = {
    reference: { invoiceNumber: order },
    client:    { clientDisplayName: order },
    date:      { issuedAt: order },
    total:     { amount: order },
    paid:      { paidAmount: order },
    remaining: { amount: order },
  };
  const orderBy = sort ? orderByMap[sort] : { issuedAt: 'desc' as const };

  // Perf 3.8 : KPIs calculés via aggregate/groupBy Postgres au lieu de
  // charger 5000 invoices en mémoire et boucler en JS.
  // - kpiTotalBilled : SUM(invoice.amount) WHERE monthWhere
  // - kpiCollected   : SUM(payment.amount) WHERE paymentDate ∈ mois ET invoice ∈ monthWhere
  // - methodGrouped  : GROUP BY payment.paymentMethod sur les mêmes paiements
  // Perf 3.9 : `allClients` (take 1000) supprimé — picker basculé vers
  // ClientSearchSelect qui appelle /api/admin/clients/search à la demande.
  const [
    invoices,
    invoiceCount,
    billedAgg,
    collectedAgg,
    methodGrouped,
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: listWhere,
      include: {
        client: { select: { id: true, name: true, email: true } },
        booking: { select: { serviceType: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.invoice.count({ where: listWhere }),
    prisma.invoice.aggregate({
      where: monthWhere,
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        paymentDate: { gte: monthStart, lte: monthEnd },
        invoice: monthWhere,
      },
      _sum: { amount: true },
    }),
    prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: {
        paymentDate: { gte: monthStart, lte: monthEnd },
        invoice: monthWhere,
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  const kpiTotalBilled = toNumber(billedAgg._sum.amount ?? 0);
  const kpiCollected = toNumber(collectedAgg._sum.amount ?? 0);
  const kpiRemaining = Math.max(0, kpiTotalBilled - kpiCollected);
  const paymentMethodStats = methodGrouped
    .filter(g => (g._count.id ?? 0) > 0)
    .map(g => ({
      paymentMethod: g.paymentMethod,
      _sum: { amount: toNumber(g._sum.amount ?? 0) },
      _count: { id: g._count.id ?? 0 },
    }));

  // ── CSV export URL ─────────────────────────────────────────────────────────
  const exportParams = new URLSearchParams({
    dateFrom: monthStart.toISOString().slice(0, 10),
    dateTo: monthEnd.toISOString().slice(0, 10),
  });
  if (status) exportParams.set('status', status);
  if (search) exportParams.set('search', search);
  if (paymentMethod) exportParams.set('paymentMethod', paymentMethod);
  if (category) exportParams.set('category', category);
  if (clientId) exportParams.set('clientId', clientId);
  const csvHref = `/api/admin/invoices/export?${exportParams.toString()}`;

  // CSV filename: dog-universe-mai-2026.csv
  const [csvYear, csvMonthNum] = selectedMonth.split('-');
  const csvMonthName = isFr
    ? MONTH_NAMES_FR_LC[parseInt(csvMonthNum) - 1]
    : formatMonthLabel(selectedMonth, 'en').split(' ')[0].toLowerCase();
  const csvFilename = `dog-universe-${csvMonthName}-${csvYear}.csv`;

  // ── QS builder ────────────────────────────────────────────────────────────
  const buildQS = (overrides: Record<string, string | null | undefined>): string => {
    const base: Record<string, string> = { month: selectedMonth };
    if (status) base.status = status;
    if (search) base.search = search;
    if (paymentMethod) base.paymentMethod = paymentMethod;
    if (category) base.category = category;
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

  // ── Labels ────────────────────────────────────────────────────────────────
  const STATUS_LABELS_FR: Record<string, string> = {
    PENDING: 'En attente', PARTIALLY_PAID: 'Partiel', PAID: 'Payée', CANCELLED: 'Annulée',
  };
  const STATUS_LABELS_EN: Record<string, string> = {
    PENDING: 'Pending', PARTIALLY_PAID: 'Partial', PAID: 'Paid', CANCELLED: 'Cancelled',
  };
  const statusLbls = isFr ? STATUS_LABELS_FR : STATUS_LABELS_EN;

  const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
    PAID:           { bg: '#EAF7EF', color: '#1A7A45', border: 'rgba(26,122,69,0.2)' },
    PARTIALLY_PAID: { bg: '#FEF3E2', color: '#B45309', border: 'rgba(180,83,9,0.2)' },
    PENDING:        { bg: '#F0EFFE', color: '#5B4FCF', border: 'rgba(91,79,207,0.2)' },
    CANCELLED:      { bg: '#F5F5F5', color: '#6B6B6B', border: 'rgba(0,0,0,0.08)' },
  };

  const METHOD_CONFIG: Record<string, { labelFr: string; labelEn: string; svg: React.ReactNode }> = {
    CASH: {
      labelFr: 'Espèces', labelEn: 'Cash',
      svg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <rect x="2" y="6" width="20" height="12" rx="1.5" />
          <circle cx="12" cy="12" r="3" />
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

  const SORT_COLS: { key: string; label: string; align: 'left' | 'right' }[] = [
    { key: 'reference', label: isFr ? 'Référence'  : 'Reference', align: 'left'  },
    { key: 'client',    label: isFr ? 'Client'     : 'Client',    align: 'left'  },
    { key: 'date',      label: isFr ? 'Date'       : 'Date',      align: 'left'  },
    { key: 'total',     label: isFr ? 'Total'      : 'Total',     align: 'right' },
    { key: 'paid',      label: isFr ? 'Payé'       : 'Paid',      align: 'right' },
    { key: 'remaining', label: isFr ? 'Restant'    : 'Remaining', align: 'right' },
  ];

  const statusFilters = [
    { value: '',               label: isFr ? 'Toutes' : 'All' },
    { value: 'PAID',           label: isFr ? 'Payées' : 'Paid' },
    { value: 'PARTIALLY_PAID', label: isFr ? 'Partiel' : 'Partial' },
    { value: 'PENDING',        label: isFr ? 'En attente' : 'Pending' },
    { value: 'CANCELLED',      label: isFr ? 'Annulées' : 'Cancelled' },
  ];

  const totalPaidByMethod = paymentMethodStats.reduce((s, r) => s + toNumber(r._sum.amount ?? 0), 0) || 1;

  const totalPages = Math.ceil(invoiceCount / limit);

  return (
    <div className="space-y-6">
      {highlightInvoiceId && <InvoiceHighlight invoiceId={highlightInvoiceId} />}
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#2A2520]">
            {isFr ? 'Facturation' : 'Billing'}
            <span className="ml-2 text-[#C4974A]">— {monthLabel}</span>
          </h1>
          <p className="text-sm text-[#8A7E75] mt-0.5">
            {isFr ? 'Encaissements et factures du mois' : 'Monthly collections and invoices'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RecomputeAllocationsButton locale={locale} />
          <CreateStandaloneInvoiceModal locale={locale} />
          <CsvDownloadButton href={csvHref} filename={csvFilename} locale={locale} />
        </div>
      </div>

      {/* ── Month Navigator ──────────────────────────────────────────────────── */}
      <MonthNavigator locale={locale} currentMonth={selectedMonth} />

      {/* ── KPIs ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[rgba(196,151,74,0.12)] rounded-xl overflow-hidden border border-[rgba(196,151,74,0.2)]">
        {/* Total facturé */}
        <div className="bg-white px-6 py-5">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7E75]">
            {isFr ? 'Total facturé' : 'Total billed'}
          </p>
          <p className="mt-1 text-2xl font-bold text-[#2A2520]">{formatMAD(kpiTotalBilled)}</p>
          <p className="text-xs text-[#8A7E75] mt-1">{invoiceCount} {isFr ? 'facture(s)' : 'invoice(s)'}</p>
        </div>
        {/* Total encaissé */}
        <div className="bg-white px-6 py-5">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7E75]">
            {isFr ? 'Total encaissé' : 'Total collected'}
          </p>
          <p className="mt-1 text-2xl font-bold text-[#C4974A]">{formatMAD(kpiCollected)}</p>
          <p className="text-xs text-[#8A7E75] mt-1">
            {kpiTotalBilled > 0
              ? `${Math.round((kpiCollected / kpiTotalBilled) * 100)}% ${isFr ? 'du facturé' : 'of billed'}`
              : '—'}
          </p>
        </div>
        {/* Reste à encaisser */}
        <div className="bg-white px-6 py-5">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-[#8A7E75]">
            {isFr ? 'Reste à encaisser' : 'Outstanding'}
          </p>
          <p className={`mt-1 text-2xl font-bold ${kpiRemaining > 0 ? 'text-[#B45309]' : 'text-[#1A7A45]'}`}>
            {formatMAD(kpiRemaining)}
          </p>
          <p className="text-xs text-[#8A7E75] mt-1">
            {kpiRemaining <= 0
              ? (isFr ? 'Tout encaissé' : 'Fully collected')
              : (kpiTotalBilled > 0 ? `${Math.round((kpiRemaining / kpiTotalBilled) * 100)}% ${isFr ? 'restant' : 'remaining'}` : '—')}
          </p>
        </div>
      </div>

      {/* ── Payment method breakdown ──────────────────────────────────────────── */}
      {paymentMethodStats.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(['CASH', 'CARD', 'CHECK', 'TRANSFER'] as const).map(method => {
            const stat = paymentMethodStats.find(s => s.paymentMethod === method);
            const amount = Number(stat?._sum.amount ?? 0);
            const count = stat?._count.id ?? 0;
            const pct = Math.round((amount / totalPaidByMethod) * 100);
            const cfg = METHOD_CONFIG[method];
            return (
              <div
                key={method}
                className="bg-white rounded-xl border border-[rgba(196,151,74,0.25)] p-4 hover:border-[#C4974A] transition-colors"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-lg border border-[rgba(196,151,74,0.3)] text-[#C4974A] flex items-center justify-center flex-shrink-0">
                    {cfg.svg}
                  </div>
                  <span className="text-sm font-medium text-[#2A2520]">
                    {isFr ? cfg.labelFr : cfg.labelEn}
                  </span>
                </div>
                <p className="text-xl font-bold text-[#2A2520]">{formatMAD(amount)}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-[#8A7E75]">{count} {isFr ? 'paiement(s)' : 'payment(s)'}</p>
                  <span className="text-xs font-bold text-[#C4974A]">{pct}%</span>
                </div>
                <div className="h-1 bg-[#C4974A]/10 rounded-full mt-2.5 overflow-hidden">
                  <div className="h-1 rounded-full bg-[#C4974A] transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Status filter pills ───────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {statusFilters.map(f => {
          const active = status === f.value;
          return (
            <Link key={f.value} href={buildQS({ status: f.value || null, page: null })}>
              <button
                type="button"
                className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                  active
                    ? 'bg-[#C4974A] text-white border border-[#C4974A] shadow-sm'
                    : 'bg-white text-[#8A7E75] border border-[rgba(196,151,74,0.3)] hover:border-[#C4974A] hover:text-[#C4974A]'
                }`}
              >
                {f.label}
              </button>
            </Link>
          );
        })}
      </div>

      {/* ── Invoices table ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[rgba(196,151,74,0.2)] overflow-hidden">
        {invoices.length === 0 ? (
          <div className="text-center py-16 text-[#8A7E75]">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-25" />
            <p className="text-sm font-medium">
              {isFr ? 'Aucune facture ce mois-ci' : 'No invoices this month'}
            </p>
            <p className="text-xs mt-1 opacity-60">
              {isFr ? 'Modifiez les filtres ou naviguez vers un autre mois.' : 'Adjust filters or navigate to another month.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px]">
                <thead>
                  <tr className="border-b border-[rgba(196,151,74,0.1)]">
                    {SORT_COLS.map(col => {
                      const isActive = sort === col.key;
                      const nextOrder = isActive && order === 'desc' ? 'asc' : 'desc';
                      const arrow = isActive ? (order === 'asc' ? '↑' : '↓') : '↕';
                      return (
                        <th
                          key={col.key}
                          className={`text-${col.align} text-[11px] font-semibold text-[#8A7E75] px-5 py-3.5 uppercase tracking-wider bg-[#FEFCF9]`}
                        >
                          <Link
                            href={buildQS({ sort: col.key, order: nextOrder, page: null })}
                            className={`inline-flex items-center gap-1 hover:text-[#C4974A] transition-colors ${isActive ? 'text-[#C4974A]' : ''}`}
                          >
                            {col.label}
                            <span className="text-[10px] opacity-50">{arrow}</span>
                          </Link>
                        </th>
                      );
                    })}
                    <th className="text-left text-[11px] font-semibold text-[#8A7E75] px-5 py-3.5 uppercase tracking-wider bg-[#FEFCF9]">
                      {isFr ? 'Statut' : 'Status'}
                    </th>
                    <th className="px-5 py-3.5 bg-[#FEFCF9]" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const invAmount = Number(inv.amount);
                    const invPaidAmount = Number(inv.paidAmount);
                    const remaining = Math.max(0, invAmount - invPaidAmount);
                    const serviceLabel =
                      inv.serviceType === 'PRODUCT_SALE'
                        ? (isFr ? 'Croquettes / Produits' : 'Croquettes / Products')
                        : inv.booking?.serviceType === 'BOARDING'
                          ? (isFr ? 'Pension' : 'Boarding')
                          : inv.booking?.serviceType === 'PET_TAXI'
                            ? (isFr ? 'Taxi animalier' : 'Pet Taxi')
                            : inv.booking?.serviceType ?? '';
                    const statusStyle = STATUS_STYLE[inv.status] ?? STATUS_STYLE['CANCELLED'];
                    const remainingColor =
                      inv.status === 'PARTIALLY_PAID' ? '#B45309'
                      : inv.status === 'PENDING' ? '#5B4FCF'
                      : '#8A7E75';
                    return (
                      <tr
                        key={inv.id}
                        id={`invoice-row-${inv.id}`}
                        className={`border-b border-[rgba(196,151,74,0.07)] last:border-0 hover:bg-[#FEFCF9] transition-colors ${
                          highlightInvoiceId === inv.id ? 'invoice-row-highlight' : ''
                        }`}
                      >
                        <td className="px-5 py-4">
                          <span className="font-mono text-sm font-bold text-[#9A7235]">{inv.invoiceNumber}</span>
                          {serviceLabel && (
                            <p className="text-xs text-[#8A7E75] mt-0.5">{serviceLabel}</p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <Link href={`/${locale}/admin/clients/${inv.client.id}`} className="text-sm text-[#2A2520] hover:text-[#C4974A] transition-colors font-medium">
                            {inv.clientDisplayName ?? inv.client.name}
                          </Link>
                        </td>
                        <td className="px-5 py-4 text-sm text-[#8A7E75]">{formatDate(inv.issuedAt, locale)}</td>
                        <td className="px-5 py-4 text-right text-[15px] font-bold text-[#2A2520]">{formatMAD(inv.amount)}</td>
                        <td className="px-5 py-4 text-right text-sm">
                          {invPaidAmount > 0 ? (
                            <span className="text-[#1A7A45] font-semibold">{formatMAD(invPaidAmount)}</span>
                          ) : (
                            <span className="text-[#8A7E75]/30">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right text-sm">
                          {remaining > 0 ? (
                            <span className="font-semibold" style={{ color: remainingColor }}>{formatMAD(remaining)}</span>
                          ) : (
                            <span className="text-[#8A7E75]/30">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={{ backgroundColor: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border }}
                          >
                            {statusLbls[inv.status] || inv.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1">
                            <Link
                              href={`/${locale}/admin/invoices/${inv.id}`}
                              title={isFr ? 'Fiche facture' : 'Invoice details'}
                              className="p-1.5 text-[#8A7E75] hover:text-[#C4974A] rounded transition-colors"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                            <a
                              href={`/api/invoices/${inv.id}/pdf?view=1`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={isFr ? 'Aperçu' : 'Preview'}
                              className="p-1.5 text-[#8A7E75] hover:text-[#C4974A] rounded transition-colors"
                            >
                              <Eye className="h-4 w-4" />
                            </a>
                            <a
                              href={`/api/invoices/${inv.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={isFr ? 'Télécharger' : 'Download'}
                              className="p-1.5 text-[#8A7E75] hover:text-[#C4974A] rounded transition-colors"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            <ResendInvoiceButton invoiceId={inv.id} locale={locale} />
                            <PaymentModal
                              invoiceId={inv.id}
                              currentStatus={inv.status}
                              locale={locale}
                              invoiceAmount={invAmount}
                              paidAmount={invPaidAmount}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer: count + pagination */}
            <div className="px-5 py-3.5 border-t border-[rgba(196,151,74,0.1)] flex items-center justify-between text-xs text-[#8A7E75]">
              <span>
                {invoiceCount} {isFr ? 'facture(s)' : 'invoice(s)'}
                {status ? ` · ${statusLbls[status] ?? status}` : ''}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  {page > 1 && (
                    <Link
                      href={buildQS({ page: String(page - 1) })}
                      className="px-2.5 py-1 rounded border border-[rgba(196,151,74,0.3)] hover:border-[#C4974A] hover:text-[#C4974A] transition-colors"
                    >
                      ←
                    </Link>
                  )}
                  <span className="px-2">
                    {page} / {totalPages}
                  </span>
                  {page < totalPages && (
                    <Link
                      href={buildQS({ page: String(page + 1) })}
                      className="px-2.5 py-1 rounded border border-[rgba(196,151,74,0.3)] hover:border-[#C4974A] hover:text-[#C4974A] transition-colors"
                    >
                      →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
