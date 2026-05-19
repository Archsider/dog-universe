// Operational metrics — non-revenue dashboard KPIs (occupancy, volumes,
// average basket, new clients, pending bookings). Light queries, used
// across /admin/{dashboard,analytics,billing} so they live in their own
// file to keep the revenue allocator file focused.

import { prisma } from '../prisma';
import { BookingStatus } from '@prisma/client';
import { toNumber } from '../decimal';
import { getMonthlyInvoicesWhere } from '../billing';
import { notDeleted } from '../prisma-soft';
import { categoryKey } from '../category';
import type { CategoryBreakdown } from './revenue';

export function deltaPercent(cur: number, prev: number): number {
  return prev === 0 ? 0 : Math.round(((cur - prev) / prev) * 1000) / 10;
}

// Compteurs ENCAISSÉS par catégorie : nombre de factures distinctes ayant
// (a) au moins un Payment dans la fenêtre [start, end] et (b) au moins un
// InvoiceItem dont la catégorie effective tombe dans le bucket.
//
// Catégorie effective = `categoryKey(it.category, it.description)` —
// MÊME logique que le drilldown analytics (qui utilise `inferItemCategory`,
// alias direct de categoryKey).  Permet de catcher les lignes legacy persistées
// avec category='OTHER' dont la description match un keyword (ex: "Ultra
// Premium Low Grain" → croquettes).  Sans cette parité, le header card
// affichait "1 vente" pendant que le drilldown listait 2 lignes — c'est le
// même family-of-bug que `js_vs_mv_current_month` retiré en PR #105.
//
// Si aucune facture n'a été encaissée pour une catégorie, le compteur tombe
// à 0 — par ex. "Toilettage — 0 soins" en mai 2026.
export async function volumeByCategory(
  start: Date,
  end: Date,
): Promise<CategoryBreakdown> {
  const invoices = await prisma.invoice.findMany({
    where: { payments: { some: { paymentDate: { gte: start, lte: end } } } },
    select: {
      id: true,
      items: { select: { category: true, description: true } },
    },
  });

  const buckets = {
    boarding: new Set<string>(),
    taxi: new Set<string>(),
    grooming: new Set<string>(),
    croquettes: new Set<string>(),
  };
  for (const inv of invoices) {
    for (const it of inv.items) {
      const k = categoryKey(it.category, it.description);
      if (k) buckets[k].add(inv.id);
    }
  }
  return {
    boarding: buckets.boarding.size,
    taxi: buckets.taxi.size,
    grooming: buckets.grooming.size,
    croquettes: buckets.croquettes.size,
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

export async function currentBoarders(): Promise<{
  cat: number;
  dog: number;
  total: number;
}> {
  // Règle UI "En cours" = IN_PROGRESS UNIQUEMENT (chien physiquement présent).
  // CONFIRMED = réservé mais pas encore arrivé → exclu de ce compteur.
  // Capacity check et facturation continuent à inclure CONFIRMED ailleurs.
  const boardingFilter = {
    ...notDeleted(),
    serviceType: 'BOARDING' as const,
    status: BookingStatus.IN_PROGRESS,
  };
  const [cat, dog] = await Promise.all([
    prisma.bookingPet.count({ where: { pet: { species: 'CAT' }, booking: boardingFilter } }),
    prisma.bookingPet.count({ where: { pet: { species: 'DOG' }, booking: boardingFilter } }),
  ]);
  return { cat, dog, total: cat + dog };
}

export async function pendingBookingsCount(): Promise<number> {
  return prisma.booking.count({ where: notDeleted({ status: 'PENDING' }) });
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
