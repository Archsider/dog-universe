// Revenue metrics — the cash-basis / Sémantique A allocator, monthly
// breakdowns, and the cached `revenueByCategoryProrata` public path.
//
// The runtime is delicate: it must keep the MV (`monthly_revenue_mv`) and
// the live JS path arithmetically aligned, otherwise the dashboard, the
// comptable's bank statement, and the /admin/analytics graphs lose sync.
// Read the inline notes carefully before refactoring.

import { prisma } from '../prisma';
import { toNumber } from '../decimal';
import {
  computeMonthlyRevenueByCategory,
  type CategoryBreakdown as AccountingCategoryBreakdown,
} from '../accounting';
import { getMonthlyInvoicesWhere } from '../billing';
import { cacheReadThrough } from '../cache';
import { casablancaYMD } from '../dates-casablanca';
import { logger } from '../logger';

// ── Cash family ─────────────────────────────────────────────────────────
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
// ("facture clôturée ce mois"). See src/lib/accounting.ts + docs/REVENUE_
// ATTRIBUTION_DECISION.md for the full rule. Tldr:
//   - a fully-paid invoice flips ENTIRELY onto the month of its last
//     payment, each item credited at 100% of its `total`
//   - PARTIALLY_PAID invoices don't contribute to the breakdown
//   - 1 invoice = 1 month, independent of item ordering
//
// `MonthlyEntry.total` is the SUM of all category buckets. For the gross
// cash of a single month go through
// `getMonthlyRevenueByCategory(year, month).totalAllCategories` of
// `@/lib/billing/monthly-revenue` (Sémantique B canonical helper).
//
// Sémantique B fix (2026-05-17): the previous implementation read
// `monthly_revenue_mv` directly, which uses `InvoiceItem.category` verbatim.
// Legacy items persisted as `category=OTHER` (created before the column
// was mandatory) fell into the invisible `other` bucket — hence flat
// Pension/Taxi/Grooming/Croquettes curves on recent months in /admin/
// analytics. The new implementation runs 12 parallel
// `computeRevenueByCategoryProrataLive` calls that re-classify via
// `inferItemCategory(category, description)` JS-side, so legacy rows are
// attributed to the right bucket. Cost: 12 DB round-trips instead of 1
// (MV). Acceptable for annual analytics (non-critical, ISR 60s).
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

  void yearStart;
  void yearEnd;
  return monthly;
}

// ── Billed family ─────────────────────────────────────────────────────────
// Base = InvoiceItem.total. Statuses: PAID + PARTIALLY_PAID. Period: Invoice.issuedAt.
// Use for service cards, activity breakdown, panier moyen.

export type CategoryBreakdown = {
  boarding: number;
  taxi: number;
  grooming: number;
  croquettes: number;
  other: number;
};

// EXPORTED for callers that need a guaranteed LIVE compute path (bypassing
// the materialized view + Redis cache). The MV reads `InvoiceItem.category`
// verbatim, which under Sémantique B funnels legacy items persisted as
// `OTHER` straight into the `other` bucket — invisible on the
// `/admin/analytics` Performance chart and Donut. The live path here
// re-classifies via `inferItemCategory(category, description)` so that
// legacy rows are still attributed to the right activity bucket.
//
// Use sparingly — the per-month query is 1 round-trip with `take=2000`.
// Looping it across 12 months (annual chart) is OK; do not use this on
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
    // Casa-anchored: `start` is `startOfMonthCasa(now)` when called from
    // /admin/{dashboard,analytics}/page.tsx — typed at 23:00 UTC the last
    // day of the previous month. `start.getMonth()+1` would return that
    // previous month on UTC runtime Vercel. See docs/BUSINESS_RULES.md §6.
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
  // See docs/BUSINESS_RULES.md §6.
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
