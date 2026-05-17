import { prisma } from '@/lib/prisma';
import { BookingStatus } from '@prisma/client';
import { toNumber } from '@/lib/decimal';
import { ACTIVE_STAY_STATUSES } from '@/lib/booking-status';
import {
  computeMonthlyRevenueByCategory,
  type CategoryBreakdown as AccountingCategoryBreakdown,
} from '@/lib/accounting';
import { getMonthlyInvoicesWhere } from '@/lib/billing';
import { cacheReadThrough } from '@/lib/cache';
import { notDeleted } from '@/lib/prisma-soft';
import { casablancaYMD } from '@/lib/dates-casablanca';

// ── Utility ───────────────────────────────────────────────────────────────────

export function deltaPercent(cur: number, prev: number): number {
  return prev === 0 ? 0 : Math.round(((cur - prev) / prev) * 1000) / 10;
}

import { categoryKey } from '@/lib/category';
import { logger } from '@/lib/logger';
// Re-export pour rétro-compat des call sites existants (analytics, etc.).
export { inferItemCategory } from '@/lib/category';
export { categoryKey };

// ── Cash family ───────────────────────────────────────────────────────────────
// Base = Payment.amount. Sémantique B canonical path for cash totals is
// `getMonthlyRevenueByCategory(year, month).totalAllCategories` from
// `@/lib/billing/monthly-revenue`. The standalone `totalCashCollected`
// helper was retired 2026-05-17 (PR consumer-migration Sémantique B) —
// callers now read the canonical helper directly so the dashboard, the
// MV, and the comptable's bank statement always speak the same number.

export type MonthlyEntry = {
  month: number; // 0–11
  total: number; // real cash = Payment.amount
  boarding: number;
  taxi: number;
  grooming: number;
  croquettes: number;
};

// Revenue per calendar month, split by InvoiceItem.category — sémantique A
// ("facture clôturée ce mois"). Voir src/lib/accounting.ts + docs/REVENUE_
// ATTRIBUTION_DECISION.md pour la règle complète. Tldr :
//   - une facture intégralement payée bascule entièrement sur le mois de son
//     dernier payment, chaque item crédité à 100 % de son `total`
//   - les factures PARTIALLY_PAID ne contribuent pas à la ventilation
//     (visibles uniquement dans le brut encaissé total)
//   - 1 facture = 1 mois, indépendant de l'ordre des items
//
// `MonthlyEntry.total` reste la SOMME des buckets ventilés — pour le brut
// encaissé d'un mois unique passer par
// `getMonthlyRevenueByCategory(year, month).totalAllCategories` de
// `@/lib/billing/monthly-revenue` (Sémantique B canonical helper).
//
// Sémantique B fix (2026-05-17, PR analytics-fix-redesign-may17) :
// l'ancienne implémentation lisait directement `monthly_revenue_mv` qui
// utilise `InvoiceItem.category` brut. Les items legacy persistés en
// `category=OTHER` (créés avant que la colonne soit obligatoire) tombent
// dans le bucket `other` invisible sur le graphique Performance par
// activité — d'où des courbes Pension/Taxi/Toilettage/Croquettes plates
// à 0 sur les mois récents. La nouvelle implémentation appelle 12 fois
// `computeRevenueByCategoryProrataLive` en parallèle, qui re-classifie via
// `inferItemCategory(category, description)` côté JS → les items legacy
// sont attribués au bon bucket. Coût : 12 round-trips DB au lieu d'1 (MV)
// ; acceptable pour analytics annuel (page non-critique, ISR 60s).
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

  // 12 LIVE computes in parallel — bypass MV so that items legacy classés
  // `OTHER` côté DB sont re-classifiés par description (inferItemCategory).
  const breakdowns = await Promise.all(
    Array.from({ length: 12 }, (_, m) => {
      const mStart = new Date(year, m, 1);
      const mEnd = new Date(year, m + 1, 0, 23, 59, 59, 999);
      return computeRevenueByCategoryProrataLive(mStart, mEnd);
    }),
  );

  for (let m = 0; m < 12; m++) {
    const breakdown = breakdowns[m];
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

// Revenue by category for a window [start, end] — sémantique A ("facture
// clôturée ce mois"). Délégué row-by-row à `computeMonthlyRevenueByCategory`
// dans `src/lib/accounting.ts` ; cette fonction n'est qu'un aggrégateur SQL.
//
// Une facture contribue UNIQUEMENT si elle est intégralement payée (somme
// payments ≥ amount, tolérance 1 centime) ET que son dernier payment tombe
// dans [start, end]. Sinon elle contribue 0 à la ventilation (les KPIs
// "brut encaissé" la voient toujours, via `getMonthlyRevenueByCategory`).
//
// La fenêtre de requête englobe les 3 cas comptables (caisse, sans-payment,
// manuel) via `getMonthlyInvoicesWhere`. La cap take=2000 protège du DoS /
// OOM en cas de volume élevé sur un mois donné.
//
// Cohérence avec la MV : la materialized view `monthly_revenue_mv`
// (migration 20260515_revenue_mv_semantic_a) implémente la MÊME règle en SQL.
// L'appelant lit la MV en priorité via `readRevenueFromMV` puis tombe sur
// cette fonction live si la MV est vide. Les deux paths doivent rester
// arithmétiquement identiques — toute évolution sémantique doit toucher
// les deux dans la même PR.
// EXPORTED for callers that need a guaranteed LIVE compute path (bypassing
// the materialized view + Redis cache). The MV reads `InvoiceItem.category`
// verbatim, which under Sémantique B funnels legacy items persisted as
// `OTHER` straight into the `other` bucket — invisible on the
// `/admin/analytics` Performance chart and Donut. The live path here
// re-classifies via `inferItemCategory(category, description)` so that
// legacy rows are still attributed to the right activity bucket.
//
// Use sparingly — the per-month query is 1 round-trip with `take=2000`.
// Looping it across 12 months (annual chart) is OK ; do not use this on
// hot per-request paths.
export async function computeRevenueByCategoryProrataLive(
  start: Date,
  end: Date,
): Promise<CategoryBreakdown> {
  return computeRevenueByCategoryProrata(start, end);
}

async function computeRevenueByCategoryProrata(
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
    // Casa-anchored : `start` est `startOfMonthCasa(now)` quand appelé
    // depuis /admin/{dashboard,analytics}/page.tsx — typé à 23:00 UTC le
    // dernier jour du mois précédent. `start.getMonth()+1` retournerait
    // ce mois précédent sur runtime UTC Vercel. Voir docs/BUSINESS_RULES.md §6.
    const { year, month } = casablancaYMD(start);
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

/**
 * Read the (year, month) row of `monthly_revenue_mv` and project it onto the
 * `CategoryBreakdown` shape. Returns `null` when the view is empty for that
 * month (zero payments yet, or MV not refreshed since the first paid
 * invoice) — the caller then falls back to live computation so the dashboard
 * never displays "0 MAD" when the MV is stale.
 */
async function readRevenueFromMV(
  year: number,
  month: number,
): Promise<CategoryBreakdown | null> {
  try {
    const rows = await prisma.$queryRaw<{ category: string; total: unknown }[]>`
      SELECT category, total
      FROM monthly_revenue_mv
      WHERE year = ${year} AND month = ${month}
    `;
    if (rows.length === 0) return null;
    const breakdown: CategoryBreakdown = {
      boarding: 0, taxi: 0, grooming: 0, croquettes: 0, other: 0,
    };
    for (const row of rows) {
      const amount = toNumber(row.total as number | string | null);
      switch (row.category) {
        case 'BOARDING':  breakdown.boarding   += amount; break;
        case 'PET_TAXI':  breakdown.taxi       += amount; break;
        case 'GROOMING':  breakdown.grooming   += amount; break;
        case 'PRODUCT':   breakdown.croquettes += amount; break;
        default:          breakdown.other      += amount; break;
      }
    }
    return breakdown;
  } catch (err) {
    // MV missing / DB down → fall back to live computation upstream.
    logger.error('metrics', 'monthly_revenue_mv unavailable for revenueByCategoryProrata', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Public cached wrapper around computeRevenueByCategoryProrata. TTL 600 s
 * (10 min) — invalidé manuellement depuis les routes Payment (POST/DELETE)
 * via cacheDel(`revenue:${year}:${month}`). Fail-open : Redis down → calcul
 * direct.
 *
 * Lecture MV-first : on tente `monthly_revenue_mv` (refresh hourly + daily).
 * Si la MV est vide pour ce mois (ex : juste après le 1er paiement, avant
 * le prochain tick cron) → fallback live calculation pour ne jamais afficher
 * un faux zéro.
 *
 * Important : la clé est dérivée du **mois civil** de `start` (pas du tuple
 * start/end exact) — toutes les call sites du code passent monthStart/monthEnd
 * via getMonthlyInvoicesWhere ; les windows libres ne sont pas attendues ici.
 */
export async function revenueByCategoryProrata(
  start: Date,
  end: Date,
): Promise<CategoryBreakdown> {
  // Casa-anchored — bug #12 du système TZ. `start` est `startOfMonthCasa(now)`
  // quand appelé depuis dashboard/analytics, typé à 23:00 UTC le dernier
  // jour du mois précédent. `start.getMonth()+1` retournait ce mois
  // précédent sur runtime UTC, polluait la cache key `revenue:YYYY:MM` et
  // déclenchait une lecture MV pour le mauvais mois.
  // Conséquence visible sur /admin/analytics section "Performance par
  // activité — 2026" qui affichait avril au lieu de mai. Symétrie avec
  // l'invalidation côté payment-allocation.ts (PR #96).
  // Voir docs/BUSINESS_RULES.md §6.
  const { year, month } = casablancaYMD(start);
  return cacheReadThrough(
    `revenue:${year}:${month}`,
    600,
    async () => {
      const mv = await readRevenueFromMV(year, month);
      if (mv) return mv;
      return computeRevenueByCategoryProrata(start, end);
    },
  );
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
