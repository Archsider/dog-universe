import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import AnalyticsCharts from './AnalyticsCharts';

interface PageProps { params: { locale: string } }

// ─── Catégorisation par description d'InvoiceItem ────────────────────────────
// Source de vérité absolue. Ordre obligatoire (transport/taxi AVANT pension).
function categoriseItem(desc: string): 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER' {
  const d = desc.toLowerCase();
  if (d.includes('transport') || d.includes('taxi') || d.includes('animalier')) return 'PET_TAXI';
  if (d.includes('croquette') || d.includes('kibble'))                           return 'PRODUCT';
  if (d.includes('toilettage') || d.includes('bain') || d.includes('coupe'))     return 'GROOMING';
  if (
    d.includes('pension') || d.includes('nuit') || d.includes('séjour') ||
    d.includes('chat')    || d.includes('chien')
  ) return 'BOARDING';
  return 'OTHER';
}

// ─── Catégorie principale d'une facture (item au plus grand total) ────────────
function mainCategory(
  items: { description: string; unitPrice: number; quantity: number }[],
): 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER' {
  if (items.length === 0) return 'OTHER';
  const biggest = items.reduce((best, item) =>
    item.unitPrice * item.quantity > best.unitPrice * best.quantity ? item : best,
  );
  return categoriseItem(biggest.description);
}

// ─── CA par service : sum(unitPrice × quantity) par catégorie ─────────────────
function computeBreakdown(
  invoices: { items: { description: string; unitPrice: number; quantity: number }[] }[],
): Record<'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER', number> {
  const result = { BOARDING: 0, PET_TAXI: 0, GROOMING: 0, PRODUCT: 0, OTHER: 0 };
  for (const inv of invoices) {
    for (const item of inv.items) {
      result[categoriseItem(item.description)] += item.unitPrice * item.quantity;
    }
  }
  return result;
}

// ─── CA total : sum(payment.amount) filtré sur la plage de dates ─────────────
function computeCA(
  invoices: { payments: { amount: number; paymentDate: Date }[] }[],
  start: Date,
  end: Date,
): number {
  return invoices.reduce((sum, inv) => {
    return sum + inv.payments
      .filter(p => p.paymentDate >= start && p.paymentDate <= end)
      .reduce((s, p) => s + p.amount, 0);
  }, 0);
}

// ─── Graphe annuel : attribution proportionnelle par paiement ────────────────
// Pour chaque paiement d'une facture : fraction = payment.amount / itemsTotal
// → chaque item voit itemAmt × fraction attribué au mois du paiement
function buildYearlyData(
  invoices: {
    items:    { description: string; unitPrice: number; quantity: number }[];
    payments: { amount: number; paymentDate: Date }[];
  }[],
  start: Date,
  end: Date,
): Record<number, { boarding: number; taxi: number; grooming: number; croquettes: number }> {
  const monthly: Record<number, { boarding: number; taxi: number; grooming: number; croquettes: number }> = {};
  for (let m = 0; m < 12; m++) monthly[m] = { boarding: 0, taxi: 0, grooming: 0, croquettes: 0 };

  for (const inv of invoices) {
    const itemsTotal = inv.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    if (itemsTotal === 0) continue;

    const paymentsInRange = inv.payments.filter(p => p.paymentDate >= start && p.paymentDate <= end);
    for (const pmt of paymentsInRange) {
      const m    = new Date(pmt.paymentDate).getMonth();
      const frac = pmt.amount / itemsTotal;

      for (const item of inv.items) {
        const amt = item.unitPrice * item.quantity * frac;
        const cat = categoriseItem(item.description);
        if      (cat === 'BOARDING') monthly[m].boarding   += amt;
        else if (cat === 'PET_TAXI') monthly[m].taxi        += amt;
        else if (cat === 'GROOMING') monthly[m].grooming    += amt;
        else if (cat === 'PRODUCT')  monthly[m].croquettes  += amt;
        // OTHER ignoré dans le graphe
      }
    }
  }
  return monthly;
}

export default async function AdminAnalyticsPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN'))
    redirect(`/${locale}/auth/login`);

  const now          = new Date();
  const currentYear  = now.getFullYear();
  const lastYear     = currentYear - 1;
  const thisM        = now.getMonth(); // 0-indexed

  const thisMonthStart  = startOfMonth(now);
  const thisMonthEnd    = endOfMonth(now);
  const lastMonthStart  = startOfMonth(subMonths(now, 1));
  const lastMonthEnd    = endOfMonth(subMonths(now, 1));
  const startCurrentYear = new Date(currentYear, 0, 1);
  const startLastYear    = new Date(lastYear, 0, 1);
  const endLastYear      = new Date(lastYear, 11, 31, 23, 59, 59, 999);

  // ─── Source unique de vérité : Invoice PAID/PARTIALLY_PAID ─────────────────
  // Zéro MonthlyRevenueSummary · Zéro booking · Zéro logique inventée.
  const [
    invoicesThisMonth,
    invoicesLastMonth,
    invoicesCurrentYear,
    invoicesLastYear,
    newClientsThisMonth,
  ] = await Promise.all([

    // Ce mois — CA, répartition services, volume, panier moyen, durée séjour
    prisma.invoice.findMany({
      where: {
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
        payments: { some: { paymentDate: { gte: thisMonthStart, lte: thisMonthEnd } } },
      },
      include: {
        items:    { select: { description: true, unitPrice: true, quantity: true } },
        payments: { select: { amount: true, paymentDate: true } },
        client:   { select: { id: true } },
      },
    }),

    // Mois précédent — deltas par service
    prisma.invoice.findMany({
      where: {
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
        payments: { some: { paymentDate: { gte: lastMonthStart, lte: lastMonthEnd } } },
      },
      include: {
        items:    { select: { description: true, unitPrice: true, quantity: true } },
        payments: { select: { amount: true, paymentDate: true } },
        client:   { select: { id: true } },
      },
    }),

    // Année courante — graphe annuel (jan → mois courant)
    prisma.invoice.findMany({
      where: {
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
        payments: { some: { paymentDate: { gte: startCurrentYear, lte: thisMonthEnd } } },
      },
      include: {
        items:    { select: { description: true, unitPrice: true, quantity: true } },
        payments: { select: { amount: true, paymentDate: true } },
      },
    }),

    // Année précédente — courbe comparaison graphe
    prisma.invoice.findMany({
      where: {
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
        payments: { some: { paymentDate: { gte: startLastYear, lte: endLastYear } } },
      },
      include: {
        items:    { select: { description: true, unitPrice: true, quantity: true } },
        payments: { select: { amount: true, paymentDate: true } },
      },
    }),

    // Nouveaux clients ce mois (hors walk-in)
    prisma.user.count({
      where: {
        role:     'CLIENT',
        isWalkIn: false,
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),
  ]);

  // ─── CA total (paiements encaissés dans la plage) ─────────────────────────
  const thisAmt = computeCA(invoicesThisMonth, thisMonthStart, thisMonthEnd);
  const lastAmt = computeCA(invoicesLastMonth, lastMonthStart, lastMonthEnd);
  const delta   = lastAmt === 0
    ? (thisAmt > 0 ? 100 : 0)
    : Math.round(((thisAmt - lastAmt) / lastAmt) * 1000) / 10;

  // ─── CA par service (unitPrice × quantity) ────────────────────────────────
  const byServiceThis = computeBreakdown(invoicesThisMonth);
  const byServiceLast = computeBreakdown(invoicesLastMonth);

  // ─── Volume par service (nb factures dont catégorie principale = service) ──
  const volumeCounts: Record<string, number> = {
    BOARDING: 0, PET_TAXI: 0, GROOMING: 0, PRODUCT: 0, OTHER: 0,
  };
  for (const inv of invoicesThisMonth) {
    volumeCounts[mainCategory(inv.items)]++;
  }

  // ─── Panier moyen ─────────────────────────────────────────────────────────
  const uniqueClients = new Set(invoicesThisMonth.map(inv => inv.client.id)).size;
  const avgBasket     = uniqueClients > 0 ? Math.round(thisAmt / uniqueClients) : 0;

  // ─── Durée moy. séjour (quantity de l'item "nuit/pension" sur factures BOARDING)
  const boardingInvoices = invoicesThisMonth.filter(
    inv => mainCategory(inv.items) === 'BOARDING',
  );
  const nightItems = boardingInvoices.flatMap(inv =>
    inv.items.filter(item => {
      const d = item.description.toLowerCase();
      return d.includes('nuit') || d.includes('pension') || d.includes('séjour');
    }),
  );
  const avgNights = nightItems.length > 0
    ? Math.round(nightItems.reduce((s, i) => s + i.quantity, 0) / nightItems.length)
    : 0;

  // ─── KPI par service (deltas mois/mois) ───────────────────────────────────
  function svcDelta(thisV: number, lastV: number): number {
    return lastV === 0
      ? (thisV > 0 ? 100 : 0)
      : Math.round(((thisV - lastV) / lastV) * 1000) / 10;
  }

  const serviceKpis = {
    boarding: {
      thisAmt: byServiceThis.BOARDING,
      lastAmt: byServiceLast.BOARDING,
      delta:   svcDelta(byServiceThis.BOARDING, byServiceLast.BOARDING),
      count:   volumeCounts.BOARDING,
    },
    taxi: {
      thisAmt: byServiceThis.PET_TAXI,
      lastAmt: byServiceLast.PET_TAXI,
      delta:   svcDelta(byServiceThis.PET_TAXI, byServiceLast.PET_TAXI),
      count:   volumeCounts.PET_TAXI,
    },
    grooming: {
      thisAmt: byServiceThis.GROOMING,
      lastAmt: byServiceLast.GROOMING,
      delta:   svcDelta(byServiceThis.GROOMING, byServiceLast.GROOMING),
      count:   volumeCounts.GROOMING,
    },
    croquettes: {
      thisAmt: byServiceThis.PRODUCT,
      lastAmt: byServiceLast.PRODUCT,
      delta:   svcDelta(byServiceThis.PRODUCT, byServiceLast.PRODUCT),
      count:   volumeCounts.PRODUCT,
    },
  };

  const volumeData = {
    boarding:   volumeCounts.BOARDING,
    taxi:       volumeCounts.PET_TAXI,
    grooming:   volumeCounts.GROOMING,
    croquettes: volumeCounts.PRODUCT,
  };

  const donutData = {
    BOARDING: byServiceThis.BOARDING,
    PET_TAXI: byServiceThis.PET_TAXI,
    GROOMING: byServiceThis.GROOMING,
    PRODUCT:  byServiceThis.PRODUCT,
    OTHER:    byServiceThis.OTHER,
  };

  // ─── Graphe annuel (mois 0 → thisM, s'arrête au mois courant) ─────────────
  const monthlyCurrentYear = buildYearlyData(invoicesCurrentYear, startCurrentYear, thisMonthEnd);
  const monthlyLastYear    = buildYearlyData(invoicesLastYear,    startLastYear,    endLastYear);

  const frMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                    'juil.', 'août',  'sept.', 'oct.', 'nov.', 'déc.'];
  const yearSuffix = String(currentYear).slice(2);

  const yearlyData = Array.from({ length: thisM + 1 }, (_, i) => ({
    month:      `${frMonths[i]} ${yearSuffix}`,
    boarding:   monthlyCurrentYear[i].boarding,
    grooming:   monthlyCurrentYear[i].grooming,
    taxi:       monthlyCurrentYear[i].taxi,
    croquettes: monthlyCurrentYear[i].croquettes,
    total:      monthlyCurrentYear[i].boarding + monthlyCurrentYear[i].grooming +
                monthlyCurrentYear[i].taxi     + monthlyCurrentYear[i].croquettes,
  }));

  const lastYearData = Array.from({ length: thisM + 1 }, (_, i) => ({
    month: frMonths[i],
    total: monthlyLastYear[i].boarding + monthlyLastYear[i].grooming +
           monthlyLastYear[i].taxi     + monthlyLastYear[i].croquettes,
  }));

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

      <AnalyticsCharts
        serviceKpis={serviceKpis}
        yearlyData={yearlyData}
        lastYearData={lastYearData}
        donutData={donutData}
        volumeData={volumeData}
        avgBasket={avgBasket}
        avgNights={avgNights}
        newClients={newClientsThisMonth}
        totalCA={thisAmt}
        totalDelta={delta}
        locale={locale}
        currentYear={currentYear}
      />
    </div>
  );
}
