'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MigrationsHealthCard } from '@/components/admin/MigrationsHealthCard';
import type { Snapshot, CronWithStatus } from './_components/types';
import { cronStatus, CRON_MAX_AGE_MS } from './_components/health-utils';
import { HealthKpiStrip } from './_components/HealthKpiStrip';
import { InvariantsSection } from './_components/InvariantsSection';
import { DbPoolSection } from './_components/DbPoolSection';
import { SlowQueriesSection } from './_components/SlowQueriesSection';
import { CronStatusSection } from './_components/CronStatusSection';
import { SmsSection } from './_components/SmsSection';

const NEVER_ANOMALY_MAX_DAYS = 9; // Only flag 'never' for daily/weekly crons

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
  const cronStatuses: CronWithStatus[] = data.cronRuns.map((c) => ({
    ...c,
    status: cronStatus(c.name, c.lastRun),
  }));

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

      {/* DB migrations diff — surfaces pending migrations the operator must
          execute manually on Supabase. Source : audit Hashimoto Q3. */}
      <MigrationsHealthCard isFr={isFr} />

      {/* Quick stats strip */}
      <HealthKpiStrip
        invariants={data.invariants}
        dlqCount={data.dlqCount}
        overdueCount={overdueCount}
        smsSent24h={data.smsStats?.sent24h}
        isFr={isFr}
      />

      {/* DB Invariants */}
      <InvariantsSection invariants={data.invariants} isFr={isFr} />

      {/* DB connection pool */}
      {data.dbPool && <DbPoolSection dbPool={data.dbPool} isFr={isFr} />}

      {/* DB slow queries */}
      {data.slowQueries && <SlowQueriesSection slowQueries={data.slowQueries} isFr={isFr} />}

      {/* BullMQ DLQ */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-charcoal">
          {isFr ? 'Files BullMQ' : 'BullMQ queues'}
        </h2>
        <div className={`rounded-lg border p-4 flex items-center justify-between ${(data.dlqCount ?? 0) > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-2">
            {(data.dlqCount ?? 0) > 0 ? (
              <AlertCircle className="h-4 w-4 text-red-600" />
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
      <CronStatusSection cronStatuses={cronStatuses} isFr={isFr} />

      {/* SMS */}
      <SmsSection smsStats={data.smsStats} isFr={isFr} />

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
