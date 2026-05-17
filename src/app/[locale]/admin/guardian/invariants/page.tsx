// /admin/guardian/invariants — SUPERADMIN-only dashboard.
//
// Reads the cached snapshots written by /api/cron/invariants-check (Redis
// keys `invariant:last:<key>` JSON). Renders one card per invariant with
// pass/fail + count + last check timestamp + sample expansion.
//
// Server component — no client hydration needed, the page reloads on
// browser refresh (Vercel CDN won't cache because of `force-dynamic`).
// Reading 10 Redis keys in parallel = single Lambda round-trip < 50ms.

import { auth } from '../../../../../../auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, AlertTriangle, ChevronLeft } from 'lucide-react';
import { cacheGet } from '@/lib/cache';
import { RefreshInvariantsButton } from './RefreshInvariantsButton';

export const dynamic = 'force-dynamic';

// Mirror the CRITICAL/WARNING enum of runAllInvariantChecks. Kept in sync
// by the cron writer.
type Severity = 'critical' | 'warning';

interface InvariantSnapshot {
  key: string;
  label: string;
  severity: Severity;
  count: number;
  sample: Array<Record<string, unknown>>;
  checkedAt: string;
}

// Known invariant keys — the dashboard reads each one and reports a
// "Never run" state if Redis is empty for that key (cron didn't fire
// yet, or 7-day TTL expired with no recent invocation). Must mirror the
// keys returned by `runAllInvariantChecks()`.
const KNOWN_INVARIANT_KEYS = [
  'overpaid',
  'negative_stock',
  'item_total_drift',
  'invoice_amount_drift',
  'allocated_sum_vs_paid',
  'payment_sum_vs_paid',
  'item_allocated_overflow',
  'fully_paid_missing_paidat',
  'mv_refresh_stale',
  // `js_vs_mv_current_month` removed 2026-05-17 — redundant with #11
  // (payment_attribution_drift) + #12 (revenue_helper_vs_live) under
  // Sémantique B. See CLAUDE.md DETTE TECHNIQUE.
  'payment_attribution_drift',
  'revenue_helper_vs_live',
] as const;

async function readSnapshot(key: string): Promise<InvariantSnapshot | null> {
  const raw = await cacheGet<string | InvariantSnapshot>(`invariant:last:${key}`);
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) as InvariantSnapshot;
  } catch {
    return null;
  }
}

function fmt(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale === 'fr' ? 'fr-MA' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function InvariantsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);
  if (session.user.role !== 'SUPERADMIN') redirect(`/${locale}/admin/dashboard`);

  const isFr = locale !== 'en';
  const snapshots = await Promise.all(KNOWN_INVARIANT_KEYS.map((k) => readSnapshot(k)));
  const rows = KNOWN_INVARIANT_KEYS.map((k, i) => ({ key: k, snap: snapshots[i] }));

  // Sort: critical violations first, then warnings, then green, then never-run.
  rows.sort((a, b) => {
    const score = (r: { snap: InvariantSnapshot | null }) => {
      if (!r.snap) return 1; // never-run goes to the bottom
      if (r.snap.count === 0) return 0;
      return r.snap.severity === 'critical' ? -2 : -1;
    };
    return score(a) - score(b);
  });

  const criticalCount = rows.filter((r) => r.snap?.count && r.snap.severity === 'critical').length;
  const warningCount = rows.filter((r) => r.snap?.count && r.snap.severity === 'warning').length;
  const neverRun = rows.filter((r) => !r.snap).length;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <Link
        href={`/${locale}/admin/guardian`}
        className="inline-flex items-center gap-1 text-sm text-charcoal/60 hover:text-charcoal"
      >
        <ChevronLeft className="h-4 w-4" />
        {isFr ? 'Retour à Guardian' : 'Back to Guardian'}
      </Link>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-charcoal">
            {isFr ? 'Invariants comptables' : 'Accounting invariants'}
          </h1>
          <p className="text-sm text-charcoal/70 mt-1">
            {isFr
              ? `Vérifications horaires de cohérence comptable. ${KNOWN_INVARIANT_KEYS.length} invariants surveillés.`
              : `Hourly accounting consistency checks. ${KNOWN_INVARIANT_KEYS.length} invariants tracked.`}
          </p>
        </div>
        <RefreshInvariantsButton isFr={isFr} />
      </header>

      {/* Top-line counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`rounded-xl border p-4 ${criticalCount > 0 ? 'bg-red-50 border-red-300' : 'bg-white border-ivory-200'}`}>
          <div className="text-2xl font-semibold text-charcoal">{criticalCount}</div>
          <div className="text-xs text-charcoal/60 mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-red-600" />
            {isFr ? 'Critiques' : 'Critical'}
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${warningCount > 0 ? 'bg-amber-50 border-amber-300' : 'bg-white border-ivory-200'}`}>
          <div className="text-2xl font-semibold text-charcoal">{warningCount}</div>
          <div className="text-xs text-charcoal/60 mt-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-600" />
            {isFr ? 'Avertissements' : 'Warnings'}
          </div>
        </div>
        <div className="rounded-xl border border-ivory-200 bg-white p-4">
          <div className="text-2xl font-semibold text-emerald-700">
            {rows.filter((r) => r.snap && r.snap.count === 0).length}
          </div>
          <div className="text-xs text-charcoal/60 mt-1 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            {isFr ? 'Verts' : 'Green'}
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${neverRun > 0 ? 'bg-gray-50 border-gray-300' : 'bg-white border-ivory-200'}`}>
          <div className="text-2xl font-semibold text-charcoal/60">{neverRun}</div>
          <div className="text-xs text-charcoal/60 mt-1">
            {isFr ? 'Jamais exécuté' : 'Never run'}
          </div>
        </div>
      </div>

      {/* Row per invariant */}
      <section className="space-y-2">
        {rows.map(({ key, snap }) => {
          if (!snap) {
            return (
              <div key={key} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-gray-500">
                    {isFr ? 'Jamais exécuté' : 'Never run'}
                  </span>
                  <span className="text-sm font-medium text-charcoal/70">{key}</span>
                </div>
              </div>
            );
          }
          const isViolated = snap.count > 0;
          const sev = snap.severity;
          const colour =
            !isViolated
              ? 'border-emerald-200 bg-emerald-50/30'
              : sev === 'critical'
                ? 'border-red-300 bg-red-50'
                : 'border-amber-300 bg-amber-50';
          return (
            <div key={key} className={`rounded-lg border p-4 ${colour}`}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  {!isViolated ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  ) : sev === 'critical' ? (
                    <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  )}
                  <span className="font-medium text-charcoal text-sm">{snap.label}</span>
                  {isViolated && (
                    <span
                      className={
                        sev === 'critical'
                          ? 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-red-600 text-white'
                          : 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-500 text-white'
                      }
                    >
                      {snap.count}
                    </span>
                  )}
                </div>
                <div className="text-xs text-charcoal/60">
                  {isFr ? 'Vérifié' : 'Checked'} {fmt(snap.checkedAt, locale)}
                </div>
              </div>
              {isViolated && snap.sample.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-900">
                    {isFr ? `Voir échantillon (${snap.sample.length})` : `View sample (${snap.sample.length})`}
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-gray-900 p-2 text-[10px] text-green-200">
                    {JSON.stringify(snap.sample, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          );
        })}
      </section>

      <footer className="text-xs text-charcoal/50 pt-4 border-t border-ivory-200">
        {isFr ? (
          <>
            Cadence : tous les <strong>1 heure</strong> via le cron{' '}
            <code>/api/cron/invariants-check</code>. Les violations critiques
            déclenchent un SMS SUPERADMIN immédiat (dédup 24h par invariant).
            Les warnings sont aussi inclus dans le digest email quotidien
            <code>health-reconciliation</code>.
          </>
        ) : (
          <>
            Cadence: every <strong>hour</strong> via cron{' '}
            <code>/api/cron/invariants-check</code>. Critical violations
            trigger an immediate SUPERADMIN SMS (24h dedup per invariant).
            Warnings are also included in the daily email digest cron
            <code>health-reconciliation</code>.
          </>
        )}
      </footer>
    </div>
  );
}
