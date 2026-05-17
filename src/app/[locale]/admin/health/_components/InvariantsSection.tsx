import { CheckCircle2 } from 'lucide-react';
import type { InvariantResult } from './types';

interface InvariantsSectionProps {
  invariants: InvariantResult[];
  isFr: boolean;
}

export function InvariantsSection({ invariants, isFr }: InvariantsSectionProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-charcoal">
        {isFr ? 'Invariants base de données' : 'Database invariants'}
      </h2>
      <div className="space-y-2">
        {invariants.map((inv) => (
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
  );
}
