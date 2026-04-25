import { prisma } from '@/lib/prisma';

// ── Utility ───────────────────────────────────────────────────────────────────

export function deltaPercent(cur: number, prev: number): number {
  return prev === 0 ? 0 : Math.round(((cur - prev) / prev) * 1000) / 10;
}

// ItemCategory → display key. Returns null for OTHER (never silently absorbed).
// Internal helper — pas exporté (3 utilisations dans ce fichier uniquement).
function categoryKey(
  cat: string,
): 'boarding' | 'taxi' | 'grooming' | 'croquettes' | null {
  if (cat === 'BOARDING') return 'boarding';
  if (cat === 'PET_TAXI') return 'taxi';
  if (cat === 'GROOMING') return 'grooming';
  if (cat === 'PRODUCT') return 'croquettes';
  return null;
}

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
  return result._sum.amount ?? 0;
}

export type MonthlyEntry = {
  month: number; // 0–11
  total: number; // real cash = Payment.amount
  boarding: number;
  taxi: number;
  grooming: number;
  croquettes: number;
};

// Cash collected per calendar month, split by category proportionally to item.total.
// total = real Payment.amount (includes OTHER). Category split = weighted approximation.
// Use for yearly revenue charts only — not for activity/billed widgets.
export async function cashByMonth(year: number): Promise<MonthlyEntry[]> {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);

  const payments = await prisma.payment.findMany({
    where: {
      paymentDate: { gte: start, lte: end },
      invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
    },
    select: {
      amount: true,
      paymentDate: true,
      invoice: { select: { items: { select: { category: true, total: true } } } },
    },
  });

  const monthly: MonthlyEntry[] = Array.from({ length: 12 }, (_, i) => ({
    month: i,
    total: 0,
    boarding: 0,
    taxi: 0,
    grooming: 0,
    croquettes: 0,
  }));

  for (const pmt of payments) {
    const m = new Date(pmt.paymentDate).getMonth();
    const itemsTotal = pmt.invoice.items.reduce((s, i) => s + i.total, 0);
    monthly[m].total += pmt.amount;
    if (itemsTotal === 0) continue;
    const frac = pmt.amount / itemsTotal;
    for (const item of pmt.invoice.items) {
      const k = categoryKey(item.category);
      if (k) monthly[m][k] += item.total * frac;
    }
  }

  // Fusionner avec MonthlyRevenueSummary pour les mois sans payments réels
  // (données historiques saisies manuellement : jan/fév/mars avant mise en prod)
  // MonthlyRevenueSummary.month = 1–12, monthly[].month = 0–11
  const summaries = await prisma.monthlyRevenueSummary.findMany({
    where: { year },
  });

  for (const summary of summaries) {
    const m = summary.month - 1;
    if (m < 0 || m > 11) continue;

    // Utiliser le summary UNIQUEMENT si aucun payment réel ce mois
    if (monthly[m].total === 0) {
      monthly[m].total =
        summary.boardingRevenue +
        summary.groomingRevenue +
        summary.taxiRevenue +
        summary.otherRevenue;
      monthly[m].boarding = summary.boardingRevenue;
      monthly[m].grooming = summary.groomingRevenue;
      monthly[m].taxi = summary.taxiRevenue;
      // otherRevenue → croquettes (pas de champ PRODUCT dans le modèle historique)
      monthly[m].croquettes = summary.otherRevenue;
    }
  }

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

// Billed amount by category — payments in [start, end] distributed proportionally across items.
// frac = pmt.amount / sum(item.total) per invoice. Matches partial-payment semantics.
export async function billedByCategory(
  start: Date,
  end: Date,
): Promise<CategoryBreakdown> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['PAID', 'PARTIALLY_PAID'] },
      payments: { some: { paymentDate: { gte: start, lte: end } } },
    },
    select: {
      items:    { select: { category: true, unitPrice: true, quantity: true } },
      payments: { select: { amount: true, paymentDate: true } },
    },
  });

  const result: CategoryBreakdown = {
    boarding: 0, taxi: 0, grooming: 0, croquettes: 0, other: 0,
  };

  for (const inv of invoices) {
    const itemsTotal = inv.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    if (itemsTotal === 0) continue;
    const periodPayments = inv.payments.filter(
      p => p.paymentDate >= start && p.paymentDate <= end,
    );
    for (const pmt of periodPayments) {
      const frac = pmt.amount / itemsTotal;
      for (const item of inv.items) {
        const k = categoryKey(item.category);
        const val = item.unitPrice * item.quantity;
        if (k) result[k] += val * frac;
        else    result.other += val * frac;
      }
    }
  }

  // Fallback MonthlyRevenueSummary : si aucun payment réel sur la période,
  // utiliser les données historiques saisies manuellement (jan/fév/mars pré-prod).
  // Détection : la période start..end couvre un mois entier → lookup unique sur (year, month).
  // MonthlyRevenueSummary.month = 1-12, Date.getMonth() = 0-11 → offset +1.
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
      result.boarding = summary.boardingRevenue;
      result.grooming = summary.groomingRevenue;
      result.taxi = summary.taxiRevenue;
      result.other = summary.otherRevenue;
      // Pas de champ PRODUCT dans le modèle historique → croquettes reste 0
    }
  }

  return result;
}

// Invoice count by dominant category (item with highest total) for PAID+PARTIALLY_PAID
// invoices with a payment in [start, end].
export async function volumeByCategory(
  start: Date,
  end: Date,
): Promise<CategoryBreakdown> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ['PAID', 'PARTIALLY_PAID'] },
      payments: { some: { paymentDate: { gte: start, lte: end } } },
    },
    select: { items: { select: { category: true, unitPrice: true, quantity: true } } },
  });

  const result: CategoryBreakdown = {
    boarding: 0,
    taxi: 0,
    grooming: 0,
    croquettes: 0,
    other: 0,
  };
  for (const inv of invoices) {
    if (inv.items.length === 0) {
      result.other++;
      continue;
    }
    // Compter chaque item avec montant > 0 (pas seulement le dominant)
    let counted = false;
    for (const item of inv.items) {
      if (item.unitPrice * item.quantity === 0) continue;
      const k = categoryKey(item.category);
      if (k) result[k]++;
      else result.other++;
      counted = true;
    }
    if (!counted) result.other++;
  }
  return result;
}

// Average basket = SUM(invoice.amount) / count(invoices) for PAID+PARTIALLY_PAID
// invoices issued in [start, end].
export async function avgBasket(start: Date, end: Date): Promise<number> {
  const result = await prisma.invoice.aggregate({
    where: {
      issuedAt: { gte: start, lte: end },
      status: { in: ['PAID', 'PARTIALLY_PAID'] },
    },
    _sum: { amount: true },
    _count: { id: true },
  });
  const count = result._count.id ?? 0;
  if (count === 0) return 0;
  return Math.round((result._sum.amount ?? 0) / count);
}

// ── Shared queries ────────────────────────────────────────────────────────────

export async function currentBoarders(): Promise<{
  cat: number;
  dog: number;
  total: number;
}> {
  const now = new Date();
  const boardingFilter = {
    serviceType: 'BOARDING' as const,
    status: 'IN_PROGRESS' as const,
    startDate: { lte: now },
    endDate: { gte: now },
  };
  const [cat, dog] = await Promise.all([
    prisma.bookingPet.count({ where: { pet: { species: 'CAT' }, booking: boardingFilter } }),
    prisma.bookingPet.count({ where: { pet: { species: 'DOG' }, booking: boardingFilter } }),
  ]);
  return { cat, dog, total: cat + dog };
}

export async function pendingBookingsCount(): Promise<number> {
  return prisma.booking.count({ where: { status: 'PENDING' } });
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
