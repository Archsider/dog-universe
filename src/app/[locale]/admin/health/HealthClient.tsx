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

interface SmsStats {
  sent24h: number;
  lastSentAt: string | null;
}

interface Snapshot {
  invariants: InvariantResult[];
  cronRuns: Array<{ name: string; lastRun: string | null }>;
  dlqCount: number | null;
  smsStats: SmsStats | null;
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

  const overdueCount = cronStatuses.filter((c) => c.status === 'overdue' || c.status === 'never').length;
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
            return (
              <div
                key={c.name}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  isNever ? 'border-red-200 bg-red-50'
                  : isOverdue ? 'border-amber-200 bg-amber-50'
                  : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isNever || isOverdue ? (
                    <ShieldAlert className={`h-3.5 w-3.5 ${isNever ? 'text-red-500' : 'text-amber-500'}`} />
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
                    <span className="text-[10px] font-semibold text-red-700 bg-red-100 px-1 rounded">
                      {isFr ? 'JAMAIS' : 'NEVER'}
                    </span>
                  )}
                </div>
                <span className={`flex items-center gap-1 text-xs ${isNever ? 'text-red-600' : isOverdue ? 'text-amber-700' : 'text-gray-500'}`}>
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
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          {data.smsStats === null ? (
            <p className="text-sm text-gray-500">
              {isFr ? 'Données SMS indisponibles (SmsLog non peuplé).' : 'SMS data unavailable (SmsLog not populated).'}
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
                  {data.smsStats.sent24h} {isFr ? `envoyé${data.smsStats.sent24h !== 1 ? 's' : ''}` : `sent`}
                </span>
                <span className="text-sm text-gray-600">
                  {isFr ? 'dernières 24h (dédup SmsLog actif)' : 'last 24h (SmsLog dedup active)'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {data.smsStats.lastSentAt
                  ? `${isFr ? 'Dernier' : 'Last'}: ${new Date(data.smsStats.lastSentAt).toLocaleString(isFr ? 'fr-FR' : 'en-GB')}`
                  : isFr ? 'Aucun SMS envoyé' : 'No SMS sent'}
              </div>
            </div>
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
