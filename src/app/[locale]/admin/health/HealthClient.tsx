'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InvariantResult {
  key: string;
  label: string;
  count: number;
  sample: Array<Record<string, unknown>>;
  severity: 'critical' | 'warning';
}

interface Snapshot {
  invariants: InvariantResult[];
  cronRuns: Array<{ name: string; lastRun: string | null }>;
  dlqCount: number | null;
  sentry: { available: boolean; note: string };
  generatedAt: string;
}

export default function HealthClient({ initial }: { initial: Snapshot }) {
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
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 60s
  useEffect(() => {
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const totalAnomalies = data.invariants.reduce((s, i) => s + i.count, 0) + (data.dlqCount ?? 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-charcoal">Santé du système</h1>
          <p className="text-sm text-gray-500">
            Snapshot généré le {new Date(data.generatedAt).toLocaleString('fr-FR')}
          </p>
        </div>
        <Button onClick={refresh} disabled={loading} variant="outline" className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Rafraîchir
        </Button>
      </div>

      <div className={`rounded-xl border p-4 ${totalAnomalies > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
        <div className="flex items-center gap-3">
          {totalAnomalies > 0 ? (
            <AlertTriangle className="h-6 w-6 text-red-600" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          )}
          <div>
            <p className="font-semibold">
              {totalAnomalies > 0
                ? `${totalAnomalies} anomalie${totalAnomalies > 1 ? 's' : ''} détectée${totalAnomalies > 1 ? 's' : ''}`
                : 'Aucune anomalie détectée'}
            </p>
            <p className="text-xs text-gray-600">Invariants DB + DLQ</p>
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Invariants base de données</h2>
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
                  <span className="font-medium text-charcoal">{inv.label}</span>
                </div>
              </div>
              {inv.count > 0 && inv.sample.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-900">
                    Voir échantillon ({inv.sample.length})
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

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Files BullMQ</h2>
        <div className={`rounded-lg border p-4 ${(data.dlqCount ?? 0) > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center justify-between">
            <span className="font-medium text-charcoal">Dead Letter Queue (DLQ)</span>
            {data.dlqCount === null ? (
              <span className="text-xs text-gray-500">indisponible</span>
            ) : (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${data.dlqCount > 0 ? 'bg-red-600 text-white' : 'bg-green-100 text-green-700'}`}>
                {data.dlqCount}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Crons — dernier passage</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {data.cronRuns.map((c) => {
            const stale = c.lastRun
              ? Date.now() - new Date(c.lastRun).getTime() > 30 * 3600 * 1000
              : true;
            return (
              <div key={c.name} className={`flex items-center justify-between rounded-lg border p-3 ${stale ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
                <span className="font-mono text-xs">{c.name}</span>
                <span className="flex items-center gap-1 text-xs text-gray-600">
                  <Clock className="h-3 w-3" />
                  {c.lastRun ? new Date(c.lastRun).toLocaleString('fr-FR') : 'inconnu'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sentry</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          {data.sentry.available ? (
            <span className="text-green-700">DSN configuré — exceptions remontées.</span>
          ) : (
            <span className="text-amber-700">SENTRY_DSN absent — pas de remontée serveur.</span>
          )}
          <p className="mt-1 text-xs text-gray-400">{data.sentry.note}</p>
        </div>
      </section>
    </div>
  );
}
