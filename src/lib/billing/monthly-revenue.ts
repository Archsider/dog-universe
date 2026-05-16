// Sémantique B (cash basis pure) — depuis 2026-05-17.
//
// SEUL point d'entrée pour le CA mensuel par catégorie. Tous les
// consommateurs (dashboard, analytics, exports, invariants horaires)
// DOIVENT passer par `getMonthlyRevenueByCategory()`. La règle ESLint
// `no-direct-revenue-computation` interdit les `prisma.payment.aggregate`
// filtrés par mois hors de ce fichier.
//
// Architecture :
//  - Fast path : lit `monthly_revenue_mv` (MV cache de la function PG
//    `compute_payment_by_category`)
//  - Drift check : si MV fresh (< 2h depuis dernier refresh Redis-stamped),
//    `waitUntil()` schedule un compute live en background → log + Sentry
//    si drift > 0.01 MAD
//  - Slow path : si MV stale (Redis miss ou > 2h), compute live synchrone
//    + drift alert avant return
//
// La function PG `compute_payment_by_category(year, month)` est la
// SOURCE DE VÉRITÉ unique de la formule. Le live path SQL ici l'appelle
// directement avec les filtres — pas de duplication algorithm.

import { prisma } from '@/lib/prisma';
import { cacheGet, cacheSet } from '@/lib/cache';
import { withSpan } from '@/lib/observability';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';

export const MV_REFRESH_REDIS_KEY = 'mv:last_refresh:monthly_revenue_mv';
export const MV_REFRESH_TTL_SECONDS = 7 * 86_400; // 7 days
export const MV_STALENESS_MS = 2 * 3_600 * 1_000; // 2h
export const DRIFT_TOLERANCE = 0.01; // 1 cent MAD

export interface MonthlyRevenueRow {
  category: string;
  amount: number;
}

export interface MonthlyRevenueResult {
  rows: MonthlyRevenueRow[];
  source: 'mv' | 'live';
  totalAllCategories: number;
  computedAt: Date;
}

/**
 * Single canonical entry point for monthly revenue (Sémantique B).
 *
 * @param year  Casa-anchored calendar year (e.g. 2026)
 * @param month Casa-anchored month 1-12
 */
export async function getMonthlyRevenueByCategory(
  year: number,
  month: number,
): Promise<MonthlyRevenueResult> {
  return withSpan('billing.monthly-revenue.read', { year, month }, async () => {
    const ageMs = await getMVAgeMs();
    const stale = ageMs == null || ageMs > MV_STALENESS_MS;

    const mvRows = await readMV(year, month);

    if (!stale) {
      // Fast path : return MV NOW, schedule async drift detection
      try {
        // Lazy-imported : @vercel/functions may be absent in local dev /
        // tests. Fail-silent if so.
        const { waitUntil } = await import('@vercel/functions').catch(() => ({ waitUntil: null }));
        if (typeof waitUntil === 'function') {
          waitUntil(driftCheckAsync(year, month, mvRows));
        }
      } catch {
        // Background scheduling failed — skip silently, the next sync
        // call (when MV goes stale) will catch the drift.
      }
      return packResult(mvRows, 'mv');
    }

    // Slow path : MV stale → compute live + sync drift alert
    const live = await computeLive(year, month);
    if (mvRows.length > 0) {
      const drift = computeDrift(mvRows, live);
      if (drift > DRIFT_TOLERANCE) {
        logger.warn('monthly-revenue', 'MV drift detected on stale read', {
          year, month, drift, mv: mvRows, live, mode: 'sync_stale',
        });
        Sentry.captureMessage('Monthly revenue MV drift (sync stale)', {
          level: 'warning',
          tags: { domain: 'billing', kind: 'mv_drift_sync' },
          extra: { year, month, drift, mv: mvRows, live },
        });
      }
    }
    return packResult(live, 'live');
  });
}

// ─── Internals ─────────────────────────────────────────────────────────

async function readMV(year: number, month: number): Promise<MonthlyRevenueRow[]> {
  return prisma.$queryRaw<MonthlyRevenueRow[]>`
    SELECT category, total::float8 AS amount
    FROM monthly_revenue_mv
    WHERE year = ${year} AND month = ${month}
    ORDER BY category
  `;
}

async function computeLive(year: number, month: number): Promise<MonthlyRevenueRow[]> {
  // Calls the same PG function that defines the MV → zero formula
  // duplication. If `compute_payment_by_category` is missing (e.g.
  // migration not yet applied), we return empty + log so the caller
  // sees the issue.
  try {
    return await prisma.$queryRaw<MonthlyRevenueRow[]>`
      SELECT category, total::float8 AS amount
      FROM compute_payment_by_category(${year}::int, ${month}::int)
      ORDER BY category
    `;
  } catch (err) {
    logger.error('monthly-revenue', 'computeLive failed (function missing ?)', {
      year, month, error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

async function driftCheckAsync(
  year: number,
  month: number,
  mvRows: MonthlyRevenueRow[],
): Promise<void> {
  try {
    const live = await computeLive(year, month);
    if (live.length === 0 && mvRows.length === 0) return;
    const drift = computeDrift(mvRows, live);
    if (drift > DRIFT_TOLERANCE) {
      logger.warn('monthly-revenue', 'Async drift detected (background check)', {
        year, month, drift, mv: mvRows, live, mode: 'async_background',
      });
      Sentry.captureMessage('Monthly revenue MV drift (async)', {
        level: 'warning',
        tags: { domain: 'billing', kind: 'mv_drift_async' },
        extra: { year, month, drift, mv: mvRows, live },
      });
    }
  } catch (err) {
    logger.error('monthly-revenue', 'Async drift check failed', {
      year, month, error: err instanceof Error ? err.message : String(err),
    });
  }
}

function computeDrift(mv: MonthlyRevenueRow[], live: MonthlyRevenueRow[]): number {
  const mvMap = new Map(mv.map(r => [r.category, Number(r.amount)]));
  const liveMap = new Map(live.map(r => [r.category, Number(r.amount)]));
  const cats = new Set([...mvMap.keys(), ...liveMap.keys()]);
  let drift = 0;
  for (const c of cats) {
    drift += Math.abs((mvMap.get(c) ?? 0) - (liveMap.get(c) ?? 0));
  }
  return drift;
}

function packResult(rows: MonthlyRevenueRow[], source: 'mv' | 'live'): MonthlyRevenueResult {
  return {
    rows: rows.map(r => ({ category: r.category, amount: Number(r.amount) })),
    source,
    totalAllCategories: rows.reduce((s, r) => s + Number(r.amount), 0),
    computedAt: new Date(),
  };
}

async function getMVAgeMs(): Promise<number | null> {
  try {
    const lastIso = await cacheGet<string>(MV_REFRESH_REDIS_KEY);
    if (!lastIso) return null;
    const t = new Date(lastIso).getTime();
    if (Number.isNaN(t)) return null;
    return Date.now() - t;
  } catch {
    return null;
  }
}

/**
 * Called by the refresh cron AFTER a successful REFRESH MV. Idempotent.
 * If REFRESH throws, this is NOT called → staleness signal persists.
 */
export async function markMVRefreshed(when: Date = new Date()): Promise<void> {
  try {
    await cacheSet(MV_REFRESH_REDIS_KEY, when.toISOString(), MV_REFRESH_TTL_SECONDS);
  } catch (err) {
    // Best-effort stamp — if Redis is down the MV will be considered
    // stale on the next read which will fall back to live path. Safe.
    logger.warn('monthly-revenue', 'failed to stamp MV refresh in Redis', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Exported for unit tests.
export const __test = { computeDrift, packResult };
