'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Database, Wrench, Trash2, RefreshCw, Activity, AlertTriangle,
  CheckCircle2, Loader2, HardDrive, Sparkles,
} from 'lucide-react';
import type { MaintenanceDiagnostics } from '@/lib/maintenance/diagnostics';

interface Props {
  locale: string;
  initialDiagnostics: MaintenanceDiagnostics;
}

type ActionKey =
  | 'clear_backup_error'
  | 'refresh_revenue_mv'
  | 'vacuum_hot_tables'
  | 'clear_business_caches'
  | 'purge_sms_log'
  | 'purge_guardian_events'
  | 'purge_action_log'
  | 'purge_password_reset_tokens'
  | 'purge_taxi_status_history'
  | 'purge_product_suggestions_resolved'
  | 'purge_heartbeat_force';

interface ActionResp { ok: boolean; rowsAffected?: number; detail?: string; error?: string }

const SAFE_ACTIONS: { key: ActionKey; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'clear_backup_error',     label: 'Vider stamp erreur backup',   icon: Sparkles,
    desc: 'Efface l\'erreur historique de backup affichée dans le dashboard.' },
  { key: 'refresh_revenue_mv',     label: 'Refresh CA materialized view', icon: RefreshCw,
    desc: 'Recalcule monthly_revenue_mv immédiatement. Élimine le lag (jusqu\'à 2h) sur /admin/billing.' },
  { key: 'vacuum_hot_tables',      label: 'VACUUM ANALYZE',              icon: Wrench,
    desc: 'Postgres housekeeping sur Notification / Heartbeat / SmsLog / ActionLog / TaxiLocation / GuardianEvent.' },
  { key: 'clear_business_caches',  label: 'Clear caches business',       icon: RefreshCw,
    desc: 'Vide les caches Redis : revenue:YYYY:MM (24 mois), capacity_*, mv:refresh:debounce.' },
];

const PURGES: { key: ActionKey; label: string; criterion: string; danger?: boolean }[] = [
  { key: 'purge_sms_log',                        label: 'SmsLog',                 criterion: '> 90 jours' },
  { key: 'purge_guardian_events',                label: 'GuardianEvent',          criterion: '> 60 jours' },
  { key: 'purge_action_log',                     label: 'ActionLog',              criterion: '> 365 jours (hors money path)', danger: true },
  { key: 'purge_password_reset_tokens',          label: 'PasswordResetToken',     criterion: 'expirés / utilisés' },
  { key: 'purge_taxi_status_history',            label: 'TaxiStatusHistory',      criterion: '> 180 jours' },
  { key: 'purge_product_suggestions_resolved',   label: 'ProductCatalogSuggestion', criterion: 'résolues > 90 jours' },
  { key: 'purge_heartbeat_force',                label: 'Heartbeat',              criterion: '> 30 jours (force)' },
];

export default function MaintenanceClient({ locale, initialDiagnostics }: Props) {
  void locale;
  const router = useRouter();
  const [diag] = useState<MaintenanceDiagnostics>(initialDiagnostics);
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [results, setResults] = useState<Record<string, ActionResp>>({});

  async function runAction(key: ActionKey, requireConfirm: boolean) {
    if (requireConfirm) {
      const ok = confirm(`Confirmer la purge ${key} ? Action irréversible.`);
      if (!ok) return;
    }
    setBusy(key);
    try {
      const r = await fetch('/api/admin/maintenance/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: key, ...(requireConfirm ? { confirm: true } : {}) }),
      });
      const j: ActionResp = await r.json();
      setResults((prev) => ({ ...prev, [key]: j }));
      // Refresh diagnostics after a destructive action.
      if (requireConfirm && j.ok) router.refresh();
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [key]: { ok: false, error: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center gap-3">
        <Wrench className="h-7 w-7 text-[#C4974A]" />
        <div>
          <h1 className="font-serif text-3xl font-bold text-charcoal">Maintenance</h1>
          <p className="text-sm text-charcoal/60 mt-0.5">
            Outils ops · purges · refresh · diagnostics. SUPERADMIN only.
          </p>
        </div>
      </header>

      {/* ── Section B — Safe actions ─────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 mb-3">
          Actions rapides
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SAFE_ACTIONS.map((a) => {
            const Icon = a.icon;
            const r = results[a.key];
            const loading = busy === a.key;
            return (
              <div key={a.key} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-charcoal text-sm">{a.label}</p>
                    <p className="text-xs text-charcoal/60 mt-0.5">{a.desc}</p>
                    {r && (
                      <p className={`text-xs mt-2 ${r.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                        {r.ok ? `✓ ${r.detail ?? 'OK'}` : `✗ ${r.error}`}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void runAction(a.key, false)}
                    disabled={loading}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Lancer'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Section C — Purges ───────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">Purges</h2>
          <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
          <span className="text-[10px] text-red-700/70">irréversibles — confirmation requise</span>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/30 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-red-50">
              <tr>
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-red-900">Table</th>
                <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-red-900">Critère</th>
                <th className="text-right px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-red-900">Résultat</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {PURGES.map((p) => {
                const r = results[p.key];
                const loading = busy === p.key;
                return (
                  <tr key={p.key} className="border-t border-red-100">
                    <td className="px-4 py-2 font-mono text-xs">{p.label}{p.danger ? ' ⚠️' : ''}</td>
                    <td className="px-4 py-2 text-xs text-charcoal/70">{p.criterion}</td>
                    <td className="px-4 py-2 text-xs text-right">
                      {r ? (
                        r.ok
                          ? <span className="text-emerald-700">✓ {r.rowsAffected ?? 0} rows</span>
                          : <span className="text-red-700">✗ {r.error}</span>
                      ) : <span className="text-charcoal/30">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void runAction(p.key, true)}
                        disabled={loading}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Purger
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section A — Diagnostics ─────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-charcoal/60 mb-3">Diagnostics</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Table sizes */}
          <DiagCard icon={HardDrive} title="Taille des tables">
            <ul className="text-xs space-y-1 font-mono">
              {diag.tableSizes.slice(0, 10).map((t) => (
                <li key={t.tableName} className="flex justify-between">
                  <span className="truncate">{t.tableName}</span>
                  <span className="text-charcoal/60 shrink-0 ml-2">{t.totalSize}</span>
                </li>
              ))}
            </ul>
          </DiagCard>

          {/* Row counts */}
          <DiagCard icon={Database} title="Volumes (active / total)">
            <ul className="text-xs space-y-1 font-mono">
              {diag.tableRowCounts.map((r) => (
                <li key={r.tableName} className="flex justify-between">
                  <span>{r.tableName}</span>
                  <span className="text-charcoal/60 shrink-0 ml-2 tabular-nums">
                    {r.active.toLocaleString()} <span className="text-charcoal/30">/ {r.total.toLocaleString()}</span>
                  </span>
                </li>
              ))}
            </ul>
          </DiagCard>

          {/* Soft-deleted age */}
          <DiagCard icon={Trash2} title="Soft-deletes par âge">
            <ul className="text-xs space-y-1.5">
              {diag.softDeletedAge.length === 0 ? (
                <li className="text-charcoal/40">Aucun soft-delete.</li>
              ) : diag.softDeletedAge.map((s) => (
                <li key={s.tableName} className="flex justify-between items-center">
                  <span className="font-semibold">{s.tableName}</span>
                  <span className="text-[11px] flex gap-2">
                    <span className="text-emerald-700">{s.lt30d} récents</span>
                    <span className="text-amber-700">{s.d30_180} moyens</span>
                    <span className="text-red-700">{s.gt180d} anciens</span>
                  </span>
                </li>
              ))}
            </ul>
          </DiagCard>

          {/* Dead tuples */}
          <DiagCard icon={Activity} title="Dead tuples (VACUUM candidates)">
            {diag.deadTuples.length === 0 ? (
              <p className="text-xs text-charcoal/40">Aucune table avec accumulation significative.</p>
            ) : (
              <ul className="text-xs space-y-1 font-mono">
                {diag.deadTuples.slice(0, 8).map((d) => (
                  <li key={d.tableName} className="flex justify-between items-center">
                    <span className="truncate">{d.tableName}</span>
                    <span className={`shrink-0 ml-2 ${d.deadPct > 20 ? 'text-red-700 font-bold' : 'text-charcoal/60'}`}>
                      {d.deadPct}% dead ({d.deadRows.toLocaleString()})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DiagCard>

          {/* Pool stats */}
          <DiagCard icon={Activity} title="Connexions Postgres">
            <ul className="text-xs space-y-1">
              {diag.poolStats.map((p) => {
                const danger = p.state === 'idle in transaction' && p.stale5min > 0;
                return (
                  <li key={p.state} className="flex justify-between">
                    <span className={`font-mono ${danger ? 'text-red-700 font-bold' : ''}`}>
                      {p.state}
                    </span>
                    <span className="text-charcoal/60">
                      {p.connections}{p.stale5min > 0 && ` (${p.stale5min} > 5min)`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </DiagCard>

          {/* MV freshness */}
          <DiagCard icon={RefreshCw} title="monthly_revenue_mv">
            {diag.mvFreshness ? (
              <div className="text-xs space-y-1">
                <p>Rows estimées : <span className="font-mono">{diag.mvFreshness.rowEstimate.toLocaleString()}</span></p>
                <p>Taille : <span className="font-mono">{diag.mvFreshness.size}</span></p>
                <p>Dernier refresh : {' '}
                  {diag.mvFreshness.lastRefreshIso
                    ? <span className="text-emerald-700">{new Date(diag.mvFreshness.lastRefreshIso).toLocaleString()}</span>
                    : <span className="text-amber-700">jamais stampé</span>}
                </p>
              </div>
            ) : <p className="text-xs text-charcoal/40">MV non trouvée</p>}
          </DiagCard>

          {/* Unused indexes */}
          {diag.unusedIndexes.length > 0 && (
            <DiagCard icon={AlertTriangle} title={`Indexes non-utilisés (${diag.unusedIndexes.length})`}>
              <ul className="text-xs space-y-1 font-mono">
                {diag.unusedIndexes.slice(0, 8).map((i) => (
                  <li key={i.indexName} className="flex justify-between">
                    <span className="truncate text-charcoal/70">{i.indexName}</span>
                    <span className="text-charcoal/60 shrink-0 ml-2">{i.indexSize}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-charcoal/40 mt-2 italic">
                Audit only — drop manuel après review.
              </p>
            </DiagCard>
          )}
        </div>
      </section>
    </div>
  );
}

function DiagCard({
  icon: Icon, title, children,
}: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ivory-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-[#C4974A]" />
        <h3 className="text-xs font-semibold text-charcoal/80 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

void CheckCircle2; // (reserved for future success states)
