import { CheckCircle2 } from 'lucide-react';
import type { SlowQueriesPayload } from './types';

interface SlowQueriesSectionProps {
  slowQueries: SlowQueriesPayload;
  isFr: boolean;
}

export function SlowQueriesSection({ slowQueries, isFr }: SlowQueriesSectionProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-charcoal">
        {isFr ? 'Requêtes DB lentes' : 'Slow DB queries'}
        <span className="ml-2 text-xs font-normal text-charcoal/50">
          ({isFr ? 'seuil' : 'threshold'} {slowQueries.thresholdMs} ms)
        </span>
      </h2>
      {!slowQueries.stats ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="font-medium text-charcoal text-sm">
            {isFr
              ? `Aucune requête > ${slowQueries.thresholdMs} ms enregistrée.`
              : `No queries above ${slowQueries.thresholdMs} ms recorded.`}
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
                {slowQueries.stats.count}
              </p>
            </div>
            <div>
              <p className="text-xs text-amber-700/70 uppercase tracking-wide">
                {isFr ? 'Pire' : 'Worst'}
              </p>
              <p className="text-xl font-bold text-amber-900 tabular-nums">
                {slowQueries.stats.maxDurationMs} ms
              </p>
            </div>
            <div>
              <p className="text-xs text-amber-700/70 uppercase tracking-wide">
                {isFr ? 'Moy.' : 'Avg.'}
              </p>
              <p className="text-xl font-bold text-amber-900 tabular-nums">
                {slowQueries.stats.avgDurationMs} ms
              </p>
            </div>
          </div>
          {slowQueries.recent.length > 0 && (
            <details className="rounded-lg border border-gray-200 bg-white p-3">
              <summary className="cursor-pointer text-xs font-medium text-charcoal/70">
                {isFr ? 'Voir les 10 plus récentes' : 'Show 10 most recent'}
              </summary>
              <ul className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                {slowQueries.recent.map((q, i) => (
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
  );
}
