'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, ShieldAlert, GitBranch, BellRing, VolumeX, Loader2, AlertCircle } from 'lucide-react';

interface GuardianEventView {
  id: string;
  sentryEventId: string;
  sentryIssueId: string | null;
  title: string;
  culprit: string | null;
  level: string | null;
  classification: string;
  severity: number;
  action: string;
  reason: string | null;
  githubIssueUrl: string | null;
  occurrencesSeen: number;
  createdAt: string;
}

const SEVERITY_COLOR: Record<number, string> = {
  1: 'bg-gray-100 text-gray-700 border-gray-300',
  2: 'bg-blue-100 text-blue-700 border-blue-300',
  3: 'bg-amber-100 text-amber-700 border-amber-300',
  4: 'bg-orange-100 text-orange-700 border-orange-300',
  5: 'bg-red-100 text-red-700 border-red-300',
};

const CLASSIFICATION_COLOR: Record<string, string> = {
  transient: 'bg-gray-100 text-gray-700',
  bug_code: 'bg-red-100 text-red-700',
  data_corruption: 'bg-purple-100 text-purple-700',
  infra: 'bg-orange-100 text-orange-700',
  spam: 'bg-zinc-100 text-zinc-600',
  unclassified: 'bg-yellow-100 text-yellow-800',
};

const ACTION_ICON: Record<string, React.ReactNode> = {
  github_issue: <GitBranch className="h-3.5 w-3.5" />,
  notify_admin: <BellRing className="h-3.5 w-3.5" />,
  silence: <VolumeX className="h-3.5 w-3.5" />,
};

const ACTION_LABEL: Record<string, { fr: string; en: string }> = {
  github_issue: { fr: 'Issue GitHub', en: 'GitHub issue' },
  notify_admin: { fr: 'Admin notifié', en: 'Admin notified' },
  silence: { fr: 'Silencé', en: 'Silenced' },
  unclassified: { fr: 'Non classifié', en: 'Unclassified' },
};

const CLASSIFICATION_LABELS: Record<string, { fr: string; en: string }> = {
  transient: { fr: 'Transitoire', en: 'Transient' },
  bug_code: { fr: 'Bug code', en: 'Code bug' },
  data_corruption: { fr: 'Corruption données', en: 'Data corruption' },
  infra: { fr: 'Infra', en: 'Infra' },
  spam: { fr: 'Spam', en: 'Spam' },
  unclassified: { fr: 'Non classifié', en: 'Unclassified' },
};

interface StatCardProps { label: string; value: number | string; color?: string; icon?: React.ReactNode }
function StatCard({ label, value, color = 'text-charcoal', icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-ivory-200 p-4 flex items-center gap-3">
      {icon && <div className="text-charcoal/40">{icon}</div>}
      <div>
        <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
        <div className="text-xs text-charcoal/60 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function GuardianClient({
  isFr,
  events: initialEvents,
}: {
  isFr: boolean;
  events: GuardianEventView[];
}) {
  const [events, setEvents] = useState<GuardianEventView[]>(initialEvents);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/guardian', { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as { events: GuardianEventView[] };
        setEvents(json.events ?? []);
        setLastRefresh(new Date());
      }
    } catch {
      // silently ignore — stale data still shown
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => void fetchEvents(), 60_000);
    return () => clearInterval(id);
  }, [fetchEvents]);

  const filtered = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.classification === filter)),
    [events, filter],
  );

  // Stats derived from all events
  const stats = useMemo(() => {
    const byClass: Record<string, number> = {};
    let critical = 0;
    let githubOpened = 0;
    events.forEach((e) => {
      byClass[e.classification] = (byClass[e.classification] ?? 0) + 1;
      if (e.severity >= 4) critical++;
      if (e.action === 'github_issue') githubOpened++;
    });
    return { byClass, critical, githubOpened, total: events.length };
  }, [events]);

  const classifications = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.classification));
    return Array.from(set);
  }, [events]);

  const relativeTime = (date: Date, fr: boolean): string => {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 10) return fr ? 'à l\'instant' : 'just now';
    if (secs < 60) return fr ? `il y a ${secs}s` : `${secs}s ago`;
    return fr ? `il y a ${Math.floor(secs / 60)} min` : `${Math.floor(secs / 60)} min ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-charcoal">
            {isFr ? 'Agent IA Gardien' : 'AI Guardian'}
          </h1>
          <p className="text-sm text-charcoal/60 mt-1">
            {isFr
              ? 'Triage automatique des erreurs Sentry via Claude Haiku. 30 derniers évènements.'
              : 'Automatic Sentry error triage via Claude Haiku. Last 30 events.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-charcoal/50">
            {isFr ? 'Actualisé' : 'Refreshed'} {relativeTime(lastRefresh, isFr)}
          </span>
          <button
            onClick={() => void fetchEvents()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-ivory-200 bg-white hover:bg-ivory-50 text-sm text-charcoal disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isFr ? 'Actualiser' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={isFr ? 'Évènements total' : 'Total events'}
          value={stats.total}
          icon={<ShieldCheck className="h-5 w-5" />}
        />
        <StatCard
          label={isFr ? 'Sévérité élevée (≥4)' : 'High severity (≥4)'}
          value={stats.critical}
          color={stats.critical > 0 ? 'text-red-600' : 'text-charcoal'}
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <StatCard
          label={isFr ? 'Issues GitHub ouvertes' : 'GitHub issues opened'}
          value={stats.githubOpened}
          color={stats.githubOpened > 0 ? 'text-blue-600' : 'text-charcoal'}
          icon={<GitBranch className="h-5 w-5" />}
        />
        <StatCard
          label={isFr ? 'Non classifiés' : 'Unclassified'}
          value={stats.byClass['unclassified'] ?? 0}
          color={(stats.byClass['unclassified'] ?? 0) > 0 ? 'text-amber-600' : 'text-charcoal'}
          icon={<AlertCircle className="h-5 w-5" />}
        />
      </div>

      {/* Classification breakdown */}
      {stats.total > 0 && (
        <div className="bg-white rounded-xl border border-ivory-200 p-4">
          <h2 className="text-sm font-semibold text-charcoal mb-3">
            {isFr ? 'Répartition par catégorie' : 'Breakdown by category'}
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byClass)
              .sort(([, a], [, b]) => b - a)
              .map(([cls, count]) => {
                const label = CLASSIFICATION_LABELS[cls]?.[isFr ? 'fr' : 'en'] ?? cls;
                const colorClass = CLASSIFICATION_COLOR[cls] ?? 'bg-gray-100 text-gray-700';
                return (
                  <button
                    key={cls}
                    onClick={() => setFilter(filter === cls ? 'all' : cls)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${colorClass} ${
                      filter === cls ? 'ring-2 ring-offset-1 ring-current' : 'border-transparent hover:opacity-80'
                    }`}
                  >
                    <span className="font-bold">{count}</span>
                    {label}
                  </button>
                );
              })}
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs text-charcoal/60 hover:text-charcoal border border-ivory-300"
              >
                ✕ {isFr ? 'Réinitialiser' : 'Reset'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* No events state */}
      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ivory-300 bg-white p-10 text-center text-charcoal/60">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{isFr ? 'Aucun évènement à afficher.' : 'No events to display.'}</p>
          <p className="text-sm mt-1">
            {isFr
              ? 'Le Guardian traitera les webhooks Sentry dès qu\'ils arrivent.'
              : 'Guardian will process Sentry webhooks as they arrive.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ivory-200 bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-ivory-100">
            <span className="text-sm font-medium text-charcoal">
              {filtered.length} {isFr ? 'évènement' : 'event'}{filtered.length !== 1 ? 's' : ''}
              {filter !== 'all' ? ` — ${CLASSIFICATION_LABELS[filter]?.[isFr ? 'fr' : 'en'] ?? filter}` : ''}
            </span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-2 py-1 text-xs border rounded-md bg-white border-ivory-300 text-charcoal"
            >
              <option value="all">{isFr ? 'Toutes catégories' : 'All categories'}</option>
              {classifications.map((c) => (
                <option key={c} value={c}>
                  {CLASSIFICATION_LABELS[c]?.[isFr ? 'fr' : 'en'] ?? c}
                </option>
              ))}
            </select>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-ivory-50 text-charcoal/70 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">{isFr ? 'Quand' : 'When'}</th>
                <th className="px-3 py-2 text-left">{isFr ? 'Titre' : 'Title'}</th>
                <th className="px-3 py-2 text-left">{isFr ? 'Catégorie' : 'Class'}</th>
                <th className="px-3 py-2 text-left">{isFr ? 'Sévérité' : 'Sev.'}</th>
                <th className="px-3 py-2 text-left">{isFr ? 'Action' : 'Action'}</th>
                <th className="px-3 py-2 text-left">24h</th>
                <th className="px-3 py-2 text-left">Issue</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const actionLbl = ACTION_LABEL[e.action] ?? { fr: e.action, en: e.action };
                return (
                  <tr key={e.id} className="border-t border-ivory-100 align-top hover:bg-ivory-50/50">
                    <td className="px-3 py-2 text-xs text-charcoal/70 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString(isFr ? 'fr-FR' : 'en-GB')}
                    </td>
                    <td className="px-3 py-2 max-w-xs">
                      <div className="font-medium text-charcoal break-words">{e.title}</div>
                      {e.culprit && (
                        <div className="text-[11px] text-charcoal/50 mt-0.5 font-mono break-all">{e.culprit}</div>
                      )}
                      {e.reason && (
                        <div className="text-[12px] text-charcoal/70 mt-1 italic">{e.reason}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${CLASSIFICATION_COLOR[e.classification] ?? 'bg-gray-100 text-gray-700'}`}>
                        {CLASSIFICATION_LABELS[e.classification]?.[isFr ? 'fr' : 'en'] ?? e.classification}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-bold ${SEVERITY_COLOR[e.severity] ?? 'bg-gray-100 text-gray-700 border-gray-300'}`}>
                        {e.severity}/5
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-charcoal/80">
                      <span className="inline-flex items-center gap-1">
                        {ACTION_ICON[e.action]}
                        {isFr ? actionLbl.fr : actionLbl.en}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-charcoal/70 tabular-nums">{e.occurrencesSeen}</td>
                    <td className="px-3 py-2 text-xs">
                      {e.githubIssueUrl ? (
                        <a href={e.githubIssueUrl} target="_blank" rel="noopener noreferrer" className="text-gold-700 hover:text-gold-800 underline">
                          GitHub
                        </a>
                      ) : (
                        <span className="text-charcoal/40">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
