'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, MessageSquare, Loader2, Activity, ShieldAlert, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InvariantResult {
  key: string;
  label: string;
  count: number;
  sample: Array<Record<string, unknown>>;
  severity: 'critical' | 'warning';
}

interface SmsRecent {
  phone: string;
  status: string;
  sentAt: string;
  bookingId: string | null;
}

interface SmsStats {
  sent24h: number;
  pending24h: number;
  blockedToday: number;
  lastSentAt: string | null;
  recent: SmsRecent[];
}

interface DbPoolStatus {
  pooled: boolean;
  via: 'port' | 'pgbouncer-flag' | 'unknown';
  warning: string | null;
}

interface SlowQueryEntry {
  at: string;
  durationMs: number;
  sql: string;
}

interface SlowQueryStats {
  count: number;
  newest: string;
  maxDurationMs: number;
  avgDurationMs: number;
}

interface SlowQueriesPayload {
  thresholdMs: number;
  stats: SlowQueryStats | null;
  recent: SlowQueryEntry[];
}

interface Snapshot {
  invariants: InvariantResult[];
  cronRuns: Array<{ name: string; lastRun: string | null }>;
  dlqCount: number | null;
  smsStats: SmsStats | null;
  dbPool?: DbPoolStatus;
  slowQueries?: SlowQueriesPayload;
  sentry: { available: boolean; note: string };
  generatedAt: string;
}

// Expected max age (ms) before a cron is considered overdue.
// We use 1.5× the scheduled interval as grace period.
const CRON_MAX_AGE_MS: Record<string, number> = {
  reminders: 36 * 3_600_000,             // daily — 36h
  'birthday-notifications': 36 * 3_600_000,
  'contract-reminders': 9 * 24 * 3_600_000,  // weekly — 9d
  'overdue-invoices': 36 * 3_600_000,
  'review-requests': 36 * 3_600_000,
  'weekly-pet-report': 9 * 24 * 3_600_000,
  'dlq-watch': 36 * 3_600_000,
  'taxi-retention': 36 * 3_600_000,
  'db-backup': 36 * 3_600_000,
  'refresh-monthly-revenue': 3 * 3_600_000,  // hourly — 3h
  'refresh-revenue-mv': 36 * 3_600_000,
  'purge-anonymized': 40 * 24 * 3_600_000, // monthly — 40d
  'health-reconciliation': 36 * 3_600_000,
  heartbeat: 10 * 60_000,                 // every 5min — 10min
};

function cronStatus(name: string, lastRun: string | null): 'ok' | 'overdue' | 'never' {
  if (!lastRun) return 'never';
  const maxAge = CRON_MAX_AGE_MS[name] ?? 36 * 3_600_000;
  const age = Date.now() - new Date(lastRun).getTime();
  return age > maxAge ? 'overdue' : 'ok';
}

function relativeTime(iso: string | null, isFr: boolean): string {
  if (!iso) return isFr ? 'Jamais' : 'Never';
  const age = Date.now() - new Date(iso).getTime();
  const min = Math.floor(age / 60_000);
  const h = Math.floor(age / 3_600_000);
  const d = Math.floor(age / 86_400_000);
  if (min < 2) return isFr ? 'à l\'instant' : 'just now';
  if (h < 2) return isFr ? `il y a ${min} min` : `${min} min ago`;
  if (d < 2) return isFr ? `il y a ${h}h` : `${h}h ago`;
  return isFr ? `il y a ${d}j` : `${d}d ago`;
}

export default function HealthClient({
  initial,
  isFr = true,
}: {
  initial: Snapshot;
  isFr?: boolean;
}) {
  const [data, setData] = useState<Snapshot>(initial);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/health', { cache: 'no-store' });
      if (res.ok) {
        const fresh = (await res.json()) as Snapshot;
        setData(fresh);
      }
    } catch {
      // silently keep stale data
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute cron statuses
  const cronStatuses = data.cronRuns.map((c) => ({
    ...c,
    status: cronStatus(c.name, c.lastRun),
  }));

  const NEVER_ANOMALY_MAX_DAYS = 9; // Only flag 'never' for daily/weekly crons
  const overdueCount = cronStatuses.filter((c) => {
    if (c.status === 'overdue') return true;
    if (c.status === 'never') {
      const maxAge = CRON_MAX_AGE_MS[c.name] ?? 36 * 3_600_000;
      return maxAge <= NEVER_ANOMALY_MAX_DAYS * 24 * 3_600_000;
    }
    return false;
  }).length;
  const totalAnomalies =
    data.invariants.reduce((s, i) => s + i.count, 0) +
    (data.dlqCount ?? 0) +
    overdueCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-charcoal">
            {isFr ? 'Santé du système' : 'System Health'}
          </h1>
          <p className="text-sm text-gray-500">
            {isFr ? 'Snapshot généré le' : 'Snapshot generated'}{' '}
            {new Date(data.generatedAt).toLocaleString(isFr ? 'fr-FR' : 'en-GB')}
          </p>
        </div>
        <Button onClick={() => void refresh()} disabled={loading} variant="outline" className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {isFr ? 'Rafraîchir' : 'Refresh'}
        </Button>
      </div>

      {/* Global status banner */}
      <div className={`rounded-xl border p-4 ${totalAnomalies > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
        <div className="flex items-center gap-3">
          {totalAnomalies > 0 ? (
            <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
          )}
          <div>
            <p className="font-semibold">
              {totalAnomalies > 0
                ? isFr
                  ? `${totalAnomalies} anomalie${totalAnomalies > 1 ? 's' : ''} détectée${totalAnomalies > 1 ? 's' : ''}`
                  : `${totalAnomalies} anomal${totalAnomalies > 1 ? 'ies' : 'y'} detected`
                : isFr ? 'Aucune anomalie détectée' : 'No anomalies detected'}
            </p>
            <p className="text-xs text-gray-600">
              {isFr ? 'Invariants DB · DLQ · Crons' : 'DB invariants · DLQ · Crons'}
            </p>
          </div>
        </div>
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-ivory-200 p-4">
          <div className={`text-2xl font-bold ${data.invariants.reduce((s, i) => s + i.count, 0) > 0 ? 'text-red-600' : 'text-charcoal'}`}>
            {data.invariants.reduce((s, i) => s + i.count, 0)}
          </div>
          <div className="text-xs text-charcoal/60 mt-0.5 flex items-center gap-1">
            <Database className="h-3 w-3" />
            {isFr ? 'Invariants DB' : 'DB invariants'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-ivory-200 p-4">
          <div className={`text-2xl font-bold ${(data.dlqCount ?? 0) > 0 ? 'text-red-600' : 'text-charcoal'}`}>
            {data.dlqCount ?? '—'}
          </div>
          <div className="text-xs text-charcoal/60 mt-0.5 flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {isFr ? 'Jobs DLQ' : 'DLQ jobs'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-ivory-200 p-4">
          <div className={`text-2xl font-bold ${overdueCount > 0 ? 'text-amber-600' : 'text-charcoal'}`}>
            {overdueCount}
          </div>
          <div className="text-xs text-charcoal/60 mt-0.5 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {isFr ? 'Crons en retard' : 'Overdue crons'}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-ivory-200 p-4">
          <div className="text-2xl font-bold text-charcoal">{data.smsStats?.sent24h ?? '—'}</div>
          <div className="text-xs text-charcoal/60 mt-0.5 flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {isFr ? 'SMS 24h' : 'SMS 24h'}
          </div>
        </div>
      </div>

      {/* DB Invariants */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-charcoal">
          {isFr ? 'Invariants base de données' : 'Database invariants'}
        </h2>
        <div className="space-y-2">
          {data.invariants.map((inv) => (
            <div
              key={inv.key}
              className={`rounded-lg border p-4 ${inv.count > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {inv.count > 0 ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${inv.severity === 'critical' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
                      {inv.count}
                    </span>
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                  <span className="font-medium text-charcoal text-sm">{inv.label}</span>
                  {inv.severity === 'critical' && inv.count > 0 && (
                    <span className="text-xs text-red-600 font-medium">{isFr ? '— critique' : '— critical'}</span>
                  )}
                </div>
              </div>
              {inv.count > 0 && inv.sample.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-900">
                    {isFr ? `Voir échantillon (${inv.sample.length})` : `View sample (${inv.sample.length})`}
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-gray-900 p-2 text-[10px] text-green-200">
                    {JSON.stringify(inv.sample, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* DB connection pool */}
      {data.dbPool && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-charcoal">
            {isFr ? 'Pool Postgres (PgBouncer)' : 'Postgres pool (PgBouncer)'}
          </h2>
          <div className={`rounded-lg border p-4 flex items-start justify-between gap-3 ${data.dbPool.pooled ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-start gap-2 min-w-0">
              {data.dbPool.pooled ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <span className="font-medium text-charcoal text-sm block">
                  {data.dbPool.pooled
                    ? isFr ? 'Pooler activé' : 'Pooler active'
                    : isFr ? 'Pooler INACTIF — scale plafonnée' : 'Pooler INACTIVE — scale capped'}
                </span>
                {data.dbPool.warning && (
                  <p className="text-xs text-red-700/90 mt-1">{data.dbPool.warning}</p>
                )}
                {data.dbPool.pooled && (
                  <p className="text-xs text-green-700/80 mt-0.5">
                    {isFr ? 'Détecté via' : 'Detected via'} <span className="font-mono">{data.dbPool.via}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* DB slow queries */}
      {data.slowQueries && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-charcoal">
            {isFr ? 'Requêtes DB lentes' : 'Slow DB queries'}
            <span className="ml-2 text-xs font-normal text-charcoal/50">
              ({isFr ? 'seuil' : 'threshold'} {data.slowQueries.thresholdMs} ms)
            </span>
          </h2>
          {!data.slowQueries.stats ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="font-medium text-charcoal text-sm">
                {isFr
                  ? `Aucune requête > ${data.slowQueries.thresholdMs} ms enregistrée.`
                  : `No queries above ${data.slowQueries.thresholdMs} ms recorded.`}
              </span>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-xs text-amber-700/70 uppercase tracking-wide">
                    {isFr ? 'Récentes' : 'Recent'}
                  </p>
                  <p className="text-xl font-bold text-amber-900 tabular-nums">
                    {data.slowQueries.stats.count}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-amber-700/70 uppercase tracking-wide">
                    {isFr ? 'Pire' : 'Worst'}
                  </p>
                  <p className="text-xl font-bold text-amber-900 tabular-nums">
                    {data.slowQueries.stats.maxDurationMs} ms
                  </p>
                </div>
                <div>
                  <p className="text-xs text-amber-700/70 uppercase tracking-wide">
                    {isFr ? 'Moy.' : 'Avg.'}
                  </p>
                  <p className="text-xl font-bold text-amber-900 tabular-nums">
                    {data.slowQueries.stats.avgDurationMs} ms
                  </p>
                </div>
              </div>
              {data.slowQueries.recent.length > 0 && (
                <details className="rounded-lg border border-gray-200 bg-white p-3">
                  <summary className="cursor-pointer text-xs font-medium text-charcoal/70">
                    {isFr ? 'Voir les 10 plus récentes' : 'Show 10 most recent'}
                  </summary>
                  <ul className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                    {data.slowQueries.recent.map((q, i) => (
                      <li key={i} className="text-xs border-l-2 border-amber-300 pl-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-amber-700 font-semibold">
                            {q.durationMs} ms
                          </span>
                          <span className="text-charcoal/40">
                            {new Date(q.at).toLocaleTimeString(isFr ? 'fr-FR' : 'en-GB')}
                          </span>
                        </div>
                        <pre className="whitespace-pre-wrap break-all text-[10px] text-charcoal/70 font-mono">
                          {q.sql}
                        </pre>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
      )}

      {/* BullMQ DLQ */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-charcoal">
          {isFr ? 'Files BullMQ' : 'BullMQ queues'}
        </h2>
        <div className={`rounded-lg border p-4 flex items-center justify-between ${(data.dlqCount ?? 0) > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-2">
            {(data.dlqCount ?? 0) > 0 ? (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            <span className="font-medium text-charcoal text-sm">Dead Letter Queue (DLQ)</span>
          </div>
          {data.dlqCount === null ? (
            <span className="text-xs text-gray-500">{isFr ? 'indisponible' : 'unavailable'}</span>
          ) : (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${data.dlqCount > 0 ? 'bg-red-600 text-white' : 'bg-green-100 text-green-700'}`}>
                {data.dlqCount} {isFr ? 'job' : 'job'}{data.dlqCount !== 1 ? 's' : ''}
              </span>
              {data.dlqCount > 0 && (
                <a href="./queues" className="text-xs text-blue-600 hover:underline">
                  {isFr ? 'Rejouer →' : 'Replay →'}
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Crons */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
          <Clock className="h-5 w-5 text-gray-500" />
          {isFr ? 'Crons — dernier passage' : 'Crons — last run'}
        </h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {cronStatuses.map((c) => {
            const isOverdue = c.status === 'overdue';
            const isNever = c.status === 'never';
            const maxAgeDays = (CRON_MAX_AGE_MS[c.name] ?? 36 * 3_600_000) / (24 * 3_600_000);
            const isNeverAnomaly = isNever && maxAgeDays <= 9;
            return (
              <div
                key={c.name}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  isNeverAnomaly ? 'border-red-200 bg-red-50'
                  : isNever ? 'border-amber-200 bg-amber-50'
                  : isOverdue ? 'border-amber-200 bg-amber-50'
                  : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isNever || isOverdue ? (
                    <ShieldAlert className={`h-3.5 w-3.5 ${isNeverAnomaly ? 'text-red-500' : 'text-amber-500'}`} />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  )}
                  <span className="font-mono text-xs text-charcoal">{c.name}</span>
                  {isOverdue && (
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1 rounded">
                      {isFr ? 'EN RETARD' : 'OVERDUE'}
                    </span>
                  )}
                  {isNever && (
                    <span className={`text-[10px] font-semibold px-1 rounded ${isNeverAnomaly ? 'text-red-700 bg-red-100' : 'text-amber-700 bg-amber-100'}`}>
                      {isFr ? 'JAMAIS' : 'NEVER'}
                    </span>
                  )}
                </div>
                <span className={`flex items-center gap-1 text-xs ${isNeverAnomaly ? 'text-red-600' : isNever ? 'text-amber-700' : isOverdue ? 'text-amber-700' : 'text-gray-500'}`}>
                  <Clock className="h-3 w-3" />
                  {relativeTime(c.lastRun, isFr)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* SMS */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-charcoal flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-gray-500" />
          SMS
        </h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
          {data.smsStats === null ? (
            <p className="text-sm text-gray-500">
              {isFr ? 'Données SMS indisponibles (SmsLog non peuplé).' : 'SMS data unavailable (SmsLog not populated).'}
            </p>
          ) : (
            <>
              {/* KPI strip: sent / pending / duplicates blocked / last activity. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-2xl font-bold text-emerald-700">{data.smsStats.sent24h}</div>
                  <div className="text-xs text-emerald-700/80">
                    {isFr ? 'Envoyés (24h)' : 'Sent (24h)'}
                  </div>
                </div>
                <div className={`rounded-md border p-3 ${
                  data.smsStats.pending24h > 0
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-gray-200 bg-gray-50'
                }`}>
                  <div className={`text-2xl font-bold ${
                    data.smsStats.pending24h > 0 ? 'text-amber-700' : 'text-gray-600'
                  }`}>
                    {data.smsStats.pending24h}
                  </div>
                  <div className={`text-xs ${
                    data.smsStats.pending24h > 0 ? 'text-amber-700/80' : 'text-gray-500'
                  }`}>
                    {isFr ? 'En attente / échecs' : 'Pending / failed'}
                  </div>
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                  <div className="text-2xl font-bold text-blue-700">{data.smsStats.blockedToday}</div>
                  <div className="text-xs text-blue-700/80">
                    {isFr ? 'Doublons bloqués (auj.)' : 'Duplicates blocked (today)'}
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-white p-3 flex items-start gap-2">
                  <Clock className="h-3 w-3 mt-1 text-gray-500 flex-shrink-0" />
                  <div className="text-xs">
                    <div className="text-gray-500 mb-1">{isFr ? 'Dernier envoi' : 'Last send'}</div>
                    <div className="font-medium text-charcoal">
                      {data.smsStats.lastSentAt
                        ? new Date(data.smsStats.lastSentAt).toLocaleString(
                            isFr ? 'fr-FR' : 'en-GB',
                            { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
                          )
                        : isFr ? '—' : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent activity — the last 20 attempts, phone-masked. The
                  PENDING badge surfaces in amber so failed sends jump out. */}
              {data.smsStats.recent.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    {isFr ? 'Activité récente' : 'Recent activity'}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500">
                          <th className="text-left py-1 pr-3 font-medium">
                            {isFr ? 'Destinataire' : 'To'}
                          </th>
                          <th className="text-left py-1 pr-3 font-medium">Status</th>
                          <th className="text-left py-1 font-medium">
                            {isFr ? 'Quand' : 'When'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.smsStats.recent.map((row, i) => (
                          <tr key={`${row.sentAt}-${i}`} className="border-b border-gray-100 last:border-0">
                            <td className="py-1 pr-3 font-mono text-charcoal">{row.phone}</td>
                            <td className="py-1 pr-3">
                              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                row.status === 'SENT'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : row.status === 'PENDING'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-gray-100 text-gray-700'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                            <td className="py-1 text-gray-600">
                              {new Date(row.sentAt).toLocaleString(
                                isFr ? 'fr-FR' : 'en-GB',
                                { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Sentry */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-charcoal">Sentry</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 flex items-start gap-3">
          {data.sentry.available ? (
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          )}
          <div>
            {data.sentry.available ? (
              <span className="text-green-700">{isFr ? 'DSN configuré — exceptions remontées.' : 'DSN configured — exceptions captured.'}</span>
            ) : (
              <span className="text-amber-700">{isFr ? 'SENTRY_DSN absent — pas de remontée serveur.' : 'SENTRY_DSN missing — no server-side capture.'}</span>
            )}
            <p className="mt-1 text-xs text-gray-400">{data.sentry.note}</p>
            <a href="./guardian" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
              {isFr ? 'Voir le Gardien IA →' : 'View AI Guardian →'}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
