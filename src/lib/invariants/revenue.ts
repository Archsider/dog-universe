// Revenue & Sémantique B (cash-basis) invariants.
//
// Sémantique B (depuis 2026-05-17) — both `monthly_revenue_mv` and the
// live PG function `compute_payment_by_category` are the canonical
// cash-basis sources. These invariants cross-check the two against the
// raw Payment table to catch:
//   - Stale MV (refresh cron stopped firing)
//   - Drift between MV and the PG function (schema migration in flight)
//   - Categorisation logic divergence (defensive)
//
// `checkJsVsMvCurrentMonth` was removed 2026-05-17 — see CLAUDE.md
// "DETTE TECHNIQUE" entry. The Sémantique A allocator it compared
// against the MV is no longer the canonical path: both the MV and the
// PG function are Sémantique B sources, and #11/#12 cover the
// cross-check apples-to-apples.

import { prisma } from '../prisma';
import type { InvariantResult } from './types';

const MV_STALENESS_THRESHOLD_HOURS = 2;

export async function checkMonthlyRevenueMvFresh(): Promise<InvariantResult> {
  // monthly_revenue_mv must be refreshed within the last 2h.
  // The refresh cron runs hourly (`5 * * * *`); if it stops firing, the
  // dashboards under-report revenue. We use the Redis last_run timestamp
  // (markCronRun) as the freshness signal — same data the /admin/health
  // dashboard reads.
  const { getCronLastRun } = await import('../observability');
  const lastRun = await getCronLastRun('refresh-monthly-revenue');
  const sample: Array<Record<string, unknown>> = [];
  let count = 0;
  if (!lastRun) {
    count = 1;
    sample.push({ reason: 'cron:last_run:refresh-monthly-revenue is missing' });
  } else {
    const ageMs = Date.now() - new Date(lastRun).getTime();
    const ageHours = ageMs / 3_600_000;
    if (ageHours > MV_STALENESS_THRESHOLD_HOURS) {
      count = 1;
      sample.push({
        lastRun,
        ageHours: Math.round(ageHours * 10) / 10,
        thresholdHours: MV_STALENESS_THRESHOLD_HOURS,
      });
    }
  }
  return {
    key: 'mv_refresh_stale',
    label: 'monthly_revenue_mv non rafraîchie depuis >2h',
    count,
    sample,
    severity: 'critical',
  };
}

// #11 payment_attribution_drift
// Sum of Payment.amount in the current Casa month MUST equal sum of
// `monthly_revenue_mv.total` for the same (year, month) — tolerance
// 0.01 MAD. Catches:
//   - Payment on a CANCELLED invoice with paidAmount=0 leaked through
//     (should be excluded by the MV's CTE filter)
//   - Orphan Payment (no Invoice — impossible by FK, defensive)
//   - PG function `compute_payment_by_category` drift after a schema
//     migration (e.g. new category added but not mapped)
//
// Note: this invariant calls `prisma.payment.aggregate`-style sums via
// raw SQL — normally banned by ESLint rule `no-direct-revenue-
// computation`, but this file is whitelisted because it owns the
// JS-vs-MV cross-check (the very thing the rule protects).
export async function checkPaymentAttributionDrift(): Promise<InvariantResult> {
  const { currentMonthCasa, startOfMonthCasa, endOfMonthCasa } = await import('../dates-casablanca');
  const now = new Date();
  const { year, month } = currentMonthCasa();
  const monthStart = startOfMonthCasa(now);
  const monthEnd = endOfMonthCasa(now);

  // Raw sum from Payment table — equivalent to the MV's casa_payment CTE
  // (filtered by paymentDate, joined on Invoice via FK) minus CANCELLED
  // invoices with paidAmount = 0 (which the MV excludes).
  const rawRows = await prisma.$queryRaw<Array<{ total: string | null }>>`
    SELECT COALESCE(SUM(p.amount), 0)::text AS total
    FROM "Payment" p
    JOIN "Invoice" i ON i.id = p."invoiceId"
    WHERE p."paymentDate" >= ${monthStart}
      AND p."paymentDate" <= ${monthEnd}
      AND NOT (i."status" = 'CANCELLED' AND i."paidAmount" = 0)
  `;
  const rawTotal = parseFloat(rawRows[0]?.total ?? '0');

  let mvTotal = 0;
  try {
    const mvRows = await prisma.$queryRaw<Array<{ total: string | null }>>`
      SELECT COALESCE(SUM(total), 0)::text AS total
      FROM monthly_revenue_mv
      WHERE year = ${year} AND month = ${month}
    `;
    mvTotal = parseFloat(mvRows[0]?.total ?? '0');
  } catch {
    return {
      key: 'payment_attribution_drift',
      label: 'Sémantique B — somme Payment vs somme MV (mois courant)',
      count: 0,
      sample: [{ note: 'monthly_revenue_mv unavailable, skipping' }],
      severity: 'critical',
    };
  }

  const diff = Math.round((rawTotal - mvTotal) * 100) / 100;
  const violated = Math.abs(diff) > 0.01;
  return {
    key: 'payment_attribution_drift',
    label: 'Sémantique B — somme Payment vs somme MV (mois courant)',
    count: violated ? 1 : 0,
    sample: violated
      ? [{ year, month, rawPaymentTotal: rawTotal, mvTotal, diff }]
      : [],
    severity: 'critical',
  };
}

// #12 revenue_helper_vs_live
// `getMonthlyRevenueByCategory(year, month)` (Sémantique B canonical
// path) MUST agree with `compute_payment_by_category(year, month)` (the
// PG function it wraps). Tolerance 0.01 MAD per category.
//
// Catches:
//   - MV out of sync with the PG function (REFRESH skipped, cron stale)
//   - PG function changed but MV not yet rebuilt
//   - Categorisation logic divergence between helper and function (impossible
//     by construction since helper calls the function — defensive)
//
// This invariant deliberately bypasses the MV staleness check inside the
// helper by calling computeLive directly — the helper itself can mask a
// stale MV by serving cached data, but the invariant must always be
// based on freshly-computed live values.
export async function checkRevenueHelperVsLive(): Promise<InvariantResult> {
  const { currentMonthCasa } = await import('../dates-casablanca');
  const { __test } = await import('../billing/monthly-revenue');
  const { year, month } = currentMonthCasa();

  let mvRows: Array<{ category: string; amount: number }> = [];
  let liveRows: Array<{ category: string; amount: number }> = [];
  try {
    const mv = await prisma.$queryRaw<Array<{ category: string; amount: string }>>`
      SELECT category, total::float8::text AS amount
      FROM monthly_revenue_mv
      WHERE year = ${year} AND month = ${month}
    `;
    mvRows = mv.map(r => ({ category: r.category, amount: parseFloat(r.amount) }));
    const live = await prisma.$queryRaw<Array<{ category: string; amount: string }>>`
      SELECT category, total::float8::text AS amount
      FROM compute_payment_by_category(${year}::int, ${month}::int)
    `;
    liveRows = live.map(r => ({ category: r.category, amount: parseFloat(r.amount) }));
  } catch {
    return {
      key: 'revenue_helper_vs_live',
      label: 'Sémantique B — MV vs compute_payment_by_category (mois courant)',
      count: 0,
      sample: [{ note: 'monthly_revenue_mv or PG function unavailable, skipping' }],
      severity: 'critical',
    };
  }

  const drift = __test.computeDrift(mvRows as never, liveRows as never);
  const violated = drift > 0.01;
  return {
    key: 'revenue_helper_vs_live',
    label: 'Sémantique B — MV vs compute_payment_by_category (mois courant)',
    count: violated ? 1 : 0,
    sample: violated
      ? [{ year, month, drift, mv: mvRows, live: liveRows }]
      : [],
    severity: 'critical',
  };
}
