import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import { ACTIVE_STAY_STATUSES } from '@/lib/booking-status';
import {
  computeMonthlyRevenueByCategory,
  type CategoryBreakdown as AccountingCategoryBreakdown,
} from '@/lib/accounting';
import { getMonthlyInvoicesWhere } from '@/lib/billing';

// ── Utility ───────────────────────────────────────────────────────────────────

export function deltaPercent(cur: number, prev: number): number {
  return prev === 0 ? 0 : Math.round(((cur - prev) / prev) * 1000) / 10;
}

import { categoryKey } from '@/lib/category';
// Re-export pour rétro-compat des call sites existants (analytics, etc.).
export { inferItemCategory } from '@/lib/category';
export { categoryKey };

// ── Cash family ───────────────────────────────────────────────────────────────
// Base = Payment.amount. Use for cash KPIs and cash-over-time charts only.

export async function totalCashCollected(start: Date, end: Date): Promise<number> {
  const result = await prisma.payment.aggregate({
    where: {
      paymentDate: { gte: start, lte: end },
      invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
    },
    _sum: { amount: true },
  });
  return toNumber(result._sum.amount);
}

export type MonthlyEntry = {
  month: number; // 0–11
  total: number; // real cash = Payment.amount
  boarding: number;
  taxi: number;
  grooming: number;
  croquettes: number;
};

// Revenue per calendar month, split by InvoiceItem.category, with **prorata
// over real nights consumed**:
//   - BOARDING items: spread the paid amount across months according to
//     nightsInMonth / totalNights of the underlying booking.
//   - Non-BOARDING items (taxi, grooming, product, other): bucketed entirely
//     in the month of booking.startDate (date de service, jamais createdAt).
// Source de vérité = SUM(Payment.amount). Open-ended bookings (no endDate)
// fall back to single-bucket on startDate.
export async function cashByMonth(year: number): Promise<MonthlyEntry[]> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  const monthly: MonthlyEntry[] = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    total: 0,
    boarding: 0,
    taxi: 0,
    grooming: 0,
    croquettes: 0,
  }));

  for (let m = 0; m < 12; m++) {
    const mStart = new Date(year, m, 1);
    const mEnd = new Date(year, m + 1, 0, 23, 59, 59, 999);
    const breakdown = await revenueByCategoryProrata(mStart, mEnd);
    monthly[m].boarding = breakdown.boarding;
    monthly[m].taxi = breakdown.taxi;
    monthly[m].grooming = breakdown.grooming;
    monthly[m].croquettes = breakdown.croquettes;
    monthly[m].total =
      breakdown.boarding +
      breakdown.taxi +
      breakdown.grooming +
      breakdown.croquettes +
      breakdown.other;
  }

  // Fallback MonthlyRevenueSummary pour les mois sans payments réels
  // (données historiques saisies manuellement, e.g. avant mise en prod).
  const summaries = await prisma.monthlyRevenueSummary.findMany({
    where: { year },
  });
  for (const summary of summaries) {
    const m = summary.month - 1;
    if (m < 0 || m > 11) continue;
    if (monthly[m].total === 0) {
      const b = toNumber(summary.boardingRevenue);
      const g = toNumber(summary.groomingRevenue);
      const t = toNumber(summary.taxiRevenue);
      const o = toNumber(summary.otherRevenue);
      monthly[m].total = b + g + t + o;
      monthly[m].boarding = b;
      monthly[m].grooming = g;
      monthly[m].taxi = t;
      monthly[m].croquettes = o;
    }
  }

  // Silence unused var warning (kept for potential clamping if needed later).
  void yearStart;
  void yearEnd;

  return monthly;
}

// ── Billed family ─────────────────────────────────────────────────────────────
// Base = InvoiceItem.total. Statuses: PAID + PARTIALLY_PAID. Period: Invoice.issuedAt.
// Use for service cards, activity breakdown, panier moyen.

export type CategoryBreakdown = {
  boarding: number;
  taxi: number;
  grooming: number;
  croquettes: number;
  other: number;
};

// Revenue by category for a window [start, end], with **prorata par nuits
// réellement consommées** :
//   - BOARDING items : montant payé spreadé sur les mois selon
//     nightsOverlap(booking.startDate, booking.endDate, start, end) / totalNights.
//   - Non-BOARDING items : bucketés sur le mois de booking.startDate (ou
//     invoice.periodDate à défaut). Jamais createdAt.
//   - Open-ended bookings (endDate IS NULL OR isOpenEnded) sans endDate :
//     fallback single-bucket sur startDate.
//
// Source de vérité = SUM(Payment.amount) sur la facture. Un paiement de 1 200
// MAD pour un séjour 25 avril → 10 mai (15 nuits, 5 avril / 10 mai) donne
// 400 MAD à avril et 800 MAD à mai.
//
// La fenêtre de requête est élargie de ±90 j pour capturer les séjours qui
// chevauchent partiellement la période cible. La cap take=2000 protège du
// DoS / OOM en cas de volume élevé.
export async function revenueByCategoryProrata(
  start: Date,
  end: Date,
): Promise<CategoryBreakdown> {
  // SOURCE DE VÉRITÉ = lib/billing.getMonthlyInvoicesWhere — même filtre que
  // /admin/billing pour ne jamais diverger entre liste et KPIs.
  // Les factures sans paiement ce mois retournent 0 dans
  // computeMonthlyRevenueByCategory (caisse prime, jamais de prorata fictif).
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['PAID', 'PARTIALLY_PAID', 'PENDING'] },
      ...getMonthlyInvoicesWhere(start, end),
    },
    select: {
      // Items ordonnés chronologiquement (cuid asc ≈ created order) — l'ordre
      // est la base de l'allocation séquentielle Payment → InvoiceItem.
      items: {
        select: { category: true, description: true, total: true },
        orderBy: { id: 'asc' },
      },
      payments: { select: { amount: true, paymentDate: true } },
    },
    take: 2000,
  });

  const result: CategoryBreakdown = {
    boarding: 0, taxi: 0, grooming: 0, croquettes: 0, other: 0,
  };

  for (const inv of invoices) {
    const sub: AccountingCategoryBreakdown = computeMonthlyRevenueByCategory(
      inv.payments,
      inv.items,
      start,
      end,
    );
    result.boarding   += sub.boarding;
    result.taxi       += sub.taxi;
    result.grooming   += sub.grooming;
    result.croquettes += sub.croquettes;
    result.other      += sub.other;
  }

  // Fallback historique pour les mois pré-prod sans payments réels.
  const total =
    result.boarding + result.taxi + result.grooming + result.croquettes + result.other;
  if (total === 0) {
    const year = start.getFullYear();
    const month = start.getMonth() + 1;
    const summary = await prisma.monthlyRevenueSummary.findFirst({
      where: { year, month },
      select: {
        boardingRevenue: true,
        groomingRevenue: true,
        taxiRevenue: true,
        otherRevenue: true,
      },
    });
    if (summary) {
      result.boarding = toNumber(summary.boardingRevenue);
      result.grooming = toNumber(summary.groomingRevenue);
      result.taxi = toNumber(summary.taxiRevenue);
      result.other = toNumber(summary.otherRevenue);
    }
  }

  return result;
}

// Backwards-compat alias — every caller now goes through the prorata version.
// Kept exported so existing imports keep working without a breaking rename.
export const billedByCategory = revenueByCategoryProrata;

// Invoice count by dominant category (item with highest total) for PAID+PARTIALLY_PAID
// invoices with a payment in [start, end].
// Compteurs ENCAISSÉS par catégorie : nombre de factures distinctes ayant
// (a) au moins un Payment dans la fenêtre [start, end] et (b) au moins un
// InvoiceItem de la catégorie cible.
//
// Aligné avec le détail analytics (ENCAISSÉ ce mois). Si aucune facture n'a
// été encaissée pour une catégorie, le compteur tombe à 0 — par ex.
// "Toilettage — 0 soins" en mai 2026.
export async function volumeByCategory(
  start: Date,
  end: Date,
): Promise<CategoryBreakdown> {
  const paidThisMonth = {
    payments: { some: { paymentDate: { gte: start, lte: end } } },
  };
  const [boarding, taxi, grooming, product] = await Promise.all([
    prisma.invoice.count({
      where: { AND: [paidThisMonth, { items: { some: { category: 'BOARDING' } } }] },
    }),
    prisma.invoice.count({
      where: { AND: [paidThisMonth, { items: { some: { category: 'PET_TAXI' } } }] },
    }),
    prisma.invoice.count({
      where: { AND: [paidThisMonth, { items: { some: { category: 'GROOMING' } } }] },
    }),
    prisma.invoice.count({
      where: { AND: [paidThisMonth, { items: { some: { category: 'PRODUCT' } } }] },
    }),
  ]);
  return {
    boarding,
    taxi,
    grooming,
    croquettes: product,
    other: 0,
  };
}

// Average basket = SUM(invoice.amount) / count(invoices) for PAID+PARTIALLY_PAID
// invoices belonging to [start, end] per getMonthlyInvoicesWhere.
export async function avgBasket(start: Date, end: Date): Promise<number> {
  const result = await prisma.invoice.aggregate({
    where: {
      ...getMonthlyInvoicesWhere(start, end),
      status: { in: ['PAID', 'PARTIALLY_PAID'] },
    },
    _sum: { amount: true },
    _count: { id: true },
  });
  const count = result._count.id ?? 0;
  if (count === 0) return 0;
  return Math.round(toNumber(result._sum.amount) / count);
}

// ── Shared queries ────────────────────────────────────────────────────────────

export async function currentBoarders(): Promise<{
  cat: number;
  dog: number;
  total: number;
}> {
  // Active stay = status CONFIRMED or IN_PROGRESS, period. endDate is NEVER
  // used to determine activeness — the admin transitions to COMPLETED when the
  // pet actually leaves (closed range, walk-in, or registered client without
  // a known end date are all handled the same way).
  const boardingFilter = {
    serviceType: 'BOARDING' as const,
    status: { in: [...ACTIVE_STAY_STATUSES] },
    startDate: { lte: new Date() },
    deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
  };
  const [cat, dog] = await Promise.all([
    prisma.bookingPet.count({ where: { pet: { species: 'CAT' }, booking: boardingFilter } }),
    prisma.bookingPet.count({ where: { pet: { species: 'DOG' }, booking: boardingFilter } }),
  ]);
  return { cat, dog, total: cat + dog };
}

export async function pendingBookingsCount(): Promise<number> {
  return prisma.booking.count({ where: { status: 'PENDING', deletedAt: null } }); // soft-delete: required — no global extension (Edge Runtime incompatible)
}

// excludeWalkIn is required — callers must be explicit about walk-in filtering.
export async function newClientsCount(
  start: Date,
  end: Date,
  excludeWalkIn: boolean,
): Promise<number> {
  return prisma.user.count({
    where: {
      role: 'CLIENT',
      createdAt: { gte: start, lte: end },
      ...(excludeWalkIn ? { isWalkIn: false } : {}),
    },
  });
}
