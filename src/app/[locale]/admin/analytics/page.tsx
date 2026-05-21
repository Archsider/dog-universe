import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { startOfMonthCasa, endOfMonthCasa, currentMonthCasa } from '@/lib/dates-casablanca';
import { inferItemCategory } from '@/lib/metrics';
import { getMonthlyInvoicesWhere } from '@/lib/billing';
import { allocateBetweenItems } from '@/lib/accounting';
import { toNumber } from '@/lib/decimal';
import { getPerformanceData } from './_performance/performance-data';
import PerformanceDashboard from './_performance/PerformanceDashboard';

// Cache ISR — analytics agrègent sur tout le mois ; recalculer toutes les 60 s
// suffit. Mutations comptables (paiement, statut booking) invalident via
// revalidateTag('admin-counts').
export const revalidate = 60;

interface PageProps { params: Promise<{ locale: string }> }

export default async function AdminAnalyticsPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN'))
    redirect(`/${locale}/auth/login`);

  const now = new Date();
  // Casa-anchored "this month" — raw `.getMonth()` uses the runtime TZ (UTC
  // on Vercel) and is off-by-one across the 00:00 Casa = 23:00 UTC boundary.
  // See docs/BUSINESS_RULES.md §6.
  const { year: currentYear, month: currentMonthNum } = currentMonthCasa();
  const thisMonthStart = startOfMonthCasa(now);
  const thisMonthEnd = endOfMonthCasa(now);

  const [perfData, categoryItems] = await Promise.all([
    getPerformanceData(currentYear, currentMonthNum),
    // Drill-down items for the clickable category breakdown.
    // ENCAISSÉ per item this month — sequential allocation Payment → InvoiceItem
    // via allocateBetweenItems ; un item à 0 encaissé est exclu.
    prisma.invoice.findMany({
      where: {
        ...getMonthlyInvoicesWhere(thisMonthStart, thisMonthEnd),
        status: { in: ['PAID', 'PARTIALLY_PAID', 'PENDING'] },
      },
      select: {
        invoiceNumber: true,
        issuedAt: true,
        clientDisplayName: true,
        client: { select: { name: true } },
        payments: {
          select: { amount: true, paymentDate: true },
          orderBy: { paymentDate: 'asc' },
        },
        items: {
          select: { id: true, description: true, quantity: true, unitPrice: true, category: true, total: true },
          orderBy: { id: 'asc' },
        },
      },
      take: 2000,
    }).then(invoices => {
      type Row = {
        description: string;
        quantity: number;
        unitPrice: number;
        category: 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT';
        invoice: {
          invoiceNumber: string;
          issuedAt: Date;
          clientDisplayName: string | null;
          client: { name: string } | null;
        };
        amount: number;
        paymentDate: Date | null;
      };
      const out: Row[] = [];
      for (const inv of invoices) {
        if (inv.payments.length === 0 || inv.items.length === 0) continue;
        // Allocation séquentielle Payment → InvoiceItem (Decimal exact).
        const allocations = allocateBetweenItems(
          inv.payments,
          inv.items,
          thisMonthStart,
          thisMonthEnd,
        );
        for (let i = 0; i < inv.items.length; i++) {
          const alloc = allocations[i];
          if (alloc.amount.lte(0)) continue;
          const it = inv.items[i];
          const cat = inferItemCategory(it.category, it.description);
          if (cat === 'OTHER') continue;
          out.push({
            description: it.description,
            quantity: it.quantity,
            unitPrice: toNumber(it.unitPrice),
            category: cat,
            amount: alloc.amount.toNumber(),
            paymentDate: alloc.lastPaidAt,
            invoice: {
              invoiceNumber: inv.invoiceNumber,
              issuedAt: inv.issuedAt,
              clientDisplayName: inv.clientDisplayName,
              client: inv.client,
            },
          });
        }
      }
      out.sort((a, b) => {
        const da = a.paymentDate?.getTime() ?? 0;
        const db = b.paymentDate?.getTime() ?? 0;
        return db - da;
      });
      return out;
    }),
  ]);

  const monthName = now.toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : 'en-US',
    { month: 'long', year: 'numeric' },
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">
          {locale === 'en' ? 'Analytics' : 'Analytiques'}
        </h1>
        <p className="text-sm text-charcoal/50 mt-0.5 capitalize">
          {locale === 'en' ? 'Overview' : 'Vue d\'ensemble'} — {monthName}
        </p>
      </div>

      <PerformanceDashboard fr={locale !== 'en'} data={perfData} categoryItems={categoryItems} />
    </div>
  );
}
