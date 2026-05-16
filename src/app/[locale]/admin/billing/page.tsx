import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getMonthlyInvoicesWhere } from '@/lib/billing';
import { safeClientWhere } from '@/lib/queries/safe-where';
import { toNumber } from '@/lib/decimal';
import CreateStandaloneInvoiceModal from '@/components/admin/CreateStandaloneInvoiceModalLazy';
import WalkinInvoiceModal from '@/components/admin/WalkinInvoiceModalLazy';
import RecomputeAllocationsButton from '@/components/admin/RecomputeAllocationsButton';
import { MonthNavigator, CsvDownloadButton } from './BillingClient';
import { formatMonthLabel } from './format-month';
import InvoiceHighlight from './InvoiceHighlight';
import { BillingKpis } from './BillingKpis';
import { BillingPaymentMethods } from './BillingPaymentMethods';
import { BillingInvoicesTable } from './BillingInvoicesTable';
import { BillingStatusFilters } from './BillingStatusFilters';
import { MONTH_NAMES_FR_LC, parseMonth, monthBounds, makeBuildQS } from './billing-utils';
import { casablancaYMD } from '@/lib/dates-casablanca';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    month?: string; status?: string; page?: string; search?: string;
    paymentMethod?: string; category?: string; sort?: string; order?: string;
    clientId?: string; invoiceId?: string;
  }>;
}

const VALID_STATUS_FILTERS = ['', 'PAID', 'PARTIALLY_PAID', 'PENDING', 'CANCELLED'];
const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'];
const VALID_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER'];
const VALID_SORTS = ['reference', 'client', 'date', 'total', 'paid', 'remaining'];
const VALID_ORDERS = ['asc', 'desc'];

export default async function AdminBillingPage(props: PageProps) {
  const { locale } = await props.params;
  const sp = await props.searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const isFr = locale === 'fr';
  const selectedMonth = parseMonth(sp.month);
  const { start: monthStart, end: monthEnd } = monthBounds(selectedMonth);
  const monthLabel = formatMonthLabel(selectedMonth, locale);

  const rawStatus = sp.status || '';
  const status = VALID_STATUS_FILTERS.includes(rawStatus) ? rawStatus : '';
  const page = Math.max(1, parseInt(sp.page || '1'));
  const limit = 25;
  const search = (sp.search || '').trim();
  const rawPaymentMethod = sp.paymentMethod || '';
  const paymentMethod = VALID_PAYMENT_METHODS.includes(rawPaymentMethod) ? rawPaymentMethod : '';
  const rawCategory = sp.category || '';
  const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : '';
  const rawSort = sp.sort || '';
  const sort = VALID_SORTS.includes(rawSort) ? rawSort : '';
  const rawOrder = sp.order || '';
  const order = (VALID_ORDERS.includes(rawOrder) ? rawOrder : 'desc') as 'asc' | 'desc';
  const clientId = (sp.clientId || '').trim();
  const highlightInvoiceId = (sp.invoiceId || '').trim();

  if (highlightInvoiceId && !sp.month) {
    const targetInv = await prisma.invoice.findUnique({
      where: { id: highlightInvoiceId },
      select: { periodDate: true, issuedAt: true },
    });
    if (targetInv) {
      const refDate = targetInv.periodDate ?? targetInv.issuedAt;
      // Casa-anchored : `refDate.getMonth()` retournerait le mois UTC,
      // off-by-one pour les Invoice.issuedAt typés à 23:00 UTC = 00:00
      // Casa le 1er du mois suivant. Voir docs/BUSINESS_RULES.md §6.
      const { year, month } = casablancaYMD(refDate);
      const invoiceMonth = `${year}-${String(month).padStart(2, '0')}`;
      if (invoiceMonth !== selectedMonth) {
        redirect(`/${locale}/admin/billing?month=${invoiceMonth}&invoiceId=${highlightInvoiceId}`);
      }
    }
  }

  const monthDateFilter = getMonthlyInvoicesWhere(monthStart, monthEnd);
  const isSuperadmin = session.user.role === 'SUPERADMIN';
  const clientRoleFilter = isSuperadmin ? {} : { client: safeClientWhere };

  const listWhere: Record<string, unknown> = {
    ...monthDateFilter, ...clientRoleFilter,
    ...(status ? { status } : {}),
    ...(clientId ? { clientId } : {}),
    ...(search ? { OR: [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { clientDisplayName: { contains: search, mode: 'insensitive' } },
      { client: { name: { contains: search, mode: 'insensitive' } } },
    ]} : {}),
    ...(paymentMethod ? { payments: { some: { paymentMethod } } } : {}),
    ...(category ? { items: { some: { category } } } : {}),
  };

  const orderByMap: Record<string, Record<string, 'asc' | 'desc'>> = {
    reference: { invoiceNumber: order }, client: { clientDisplayName: order },
    date: { issuedAt: order }, total: { amount: order },
    paid: { paidAmount: order }, remaining: { amount: order },
  };
  const orderBy = sort ? orderByMap[sort] : { issuedAt: 'desc' as const };
  const monthWhere = monthDateFilter;

  const [invoices, invoiceCount, billedAgg, collectedAgg, methodGrouped] = await Promise.all([
    prisma.invoice.findMany({
      where: listWhere,
      include: {
        client: { select: { id: true, name: true, email: true, isWalkIn: true } },
        booking: { select: { serviceType: true } },
      },
      orderBy, skip: (page - 1) * limit, take: limit,
    }),
    prisma.invoice.count({ where: listWhere }),
    prisma.invoice.aggregate({ where: monthWhere, _sum: { amount: true } }),
    // eslint-disable-next-line dog-universe/no-direct-revenue-computation -- OK: KPI "Total Encaissé" + breakdown par méthode de paiement — migration vers getMonthlyRevenueByCategory() prévue dans PR suivante (consumer migration Sémantique B).
    prisma.payment.aggregate({
      where: { paymentDate: { gte: monthStart, lte: monthEnd }, invoice: monthWhere },
      _sum: { amount: true },
    }),
    // eslint-disable-next-line dog-universe/no-direct-revenue-computation -- OK: breakdown par paymentMethod (CASH/CARD/CHECK/TRANSFER) — la formule prorata catégorie ne s'applique pas ici, c'est un split orthogonal.
    prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: { paymentDate: { gte: monthStart, lte: monthEnd }, invoice: monthWhere },
      _sum: { amount: true }, _count: { id: true },
    }),
  ]);

  const kpiTotalBilled = toNumber(billedAgg._sum.amount ?? 0);
  const kpiCollected = toNumber(collectedAgg._sum.amount ?? 0);
  const kpiRemaining = Math.max(0, kpiTotalBilled - kpiCollected);
  const paymentMethodStats = methodGrouped
    .filter(g => (g._count.id ?? 0) > 0)
    .map(g => ({ paymentMethod: g.paymentMethod, _sum: { amount: toNumber(g._sum.amount ?? 0) }, _count: { id: g._count.id ?? 0 } }));

  const exportParams = new URLSearchParams({ dateFrom: monthStart.toISOString().slice(0, 10), dateTo: monthEnd.toISOString().slice(0, 10) });
  if (status) exportParams.set('status', status);
  if (search) exportParams.set('search', search);
  if (paymentMethod) exportParams.set('paymentMethod', paymentMethod);
  if (category) exportParams.set('category', category);
  if (clientId) exportParams.set('clientId', clientId);
  const csvHref = `/api/admin/invoices/export?${exportParams.toString()}`;

  const [csvYear, csvMonthNum] = selectedMonth.split('-');
  const csvMonthName = isFr
    ? MONTH_NAMES_FR_LC[parseInt(csvMonthNum) - 1]
    : formatMonthLabel(selectedMonth, 'en').split(' ')[0].toLowerCase();
  const csvFilename = `dog-universe-${csvMonthName}-${csvYear}.csv`;

  const buildQS = makeBuildQS(selectedMonth, status, search, paymentMethod, category, sort, order, clientId);
  const totalPages = Math.ceil(invoiceCount / limit);

  return (
    <div className="space-y-6">
      {highlightInvoiceId && <InvoiceHighlight invoiceId={highlightInvoiceId} />}
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
          <WalkinInvoiceModal locale={locale} />
          <CreateStandaloneInvoiceModal locale={locale} />
          <CsvDownloadButton href={csvHref} filename={csvFilename} locale={locale} />
        </div>
      </div>
      <MonthNavigator locale={locale} currentMonth={selectedMonth} />
      <BillingKpis locale={locale} kpiTotalBilled={kpiTotalBilled} kpiCollected={kpiCollected} kpiRemaining={kpiRemaining} invoiceCount={invoiceCount} />
      <BillingPaymentMethods locale={locale} paymentMethodStats={paymentMethodStats} />
      <BillingStatusFilters locale={locale} status={status} buildQS={buildQS} />
      <BillingInvoicesTable
        locale={locale} invoices={invoices} invoiceCount={invoiceCount}
        sort={sort} order={order} status={status} page={page}
        totalPages={totalPages} highlightInvoiceId={highlightInvoiceId}
        buildQS={buildQS}
      />
    </div>
  );
}
