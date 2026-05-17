import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { DbPoolStatus } from './types';

interface DbPoolSectionProps {
  dbPool: DbPoolStatus;
  isFr: boolean;
}

export function DbPoolSection({ dbPool, isFr }: DbPoolSectionProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-charcoal">
        {isFr ? 'Pool Postgres (PgBouncer)' : 'Postgres pool (PgBouncer)'}
      </h2>
      <div className={`rounded-lg border p-4 flex items-start justify-between gap-3 ${dbPool.pooled ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
        <div className="flex items-start gap-2 min-w-0">
          {dbPool.pooled ? (
            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <span className="font-medium text-charcoal text-sm block">
              {dbPool.pooled
                ? isFr ? 'Pooler activé' : 'Pooler active'
                : isFr ? 'Pooler INACTIF — scale plafonnée' : 'Pooler INACTIVE — scale capped'}
            </span>
            {dbPool.warning && (
              <p className="text-xs text-red-700/90 mt-1">{dbPool.warning}</p>
            )}
            {dbPool.pooled && (
              <p className="text-xs text-green-700/80 mt-0.5">
                {isFr ? 'Détecté via' : 'Detected via'} <span className="font-mono">{dbPool.via}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
