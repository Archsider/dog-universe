import { Database, MessageSquare, Clock, Activity } from 'lucide-react';
import type { InvariantResult } from './types';

interface HealthKpiStripProps {
  invariants: InvariantResult[];
  dlqCount: number | null;
  overdueCount: number;
  smsSent24h: number | undefined;
  isFr: boolean;
}

export function HealthKpiStrip({
  invariants,
  dlqCount,
  overdueCount,
  smsSent24h,
  isFr,
}: HealthKpiStripProps) {
  const invariantTotal = invariants.reduce((s, i) => s + i.count, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-white rounded-xl border border-ivory-200 p-4">
        <div className={`text-2xl font-bold ${invariantTotal > 0 ? 'text-red-600' : 'text-charcoal'}`}>
          {invariantTotal}
        </div>
        <div className="text-xs text-charcoal/60 mt-0.5 flex items-center gap-1">
          <Database className="h-3 w-3" />
          {isFr ? 'Invariants DB' : 'DB invariants'}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-ivory-200 p-4">
        <div className={`text-2xl font-bold ${(dlqCount ?? 0) > 0 ? 'text-red-600' : 'text-charcoal'}`}>
          {dlqCount ?? '—'}
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
        <div className="text-2xl font-bold text-charcoal">{smsSent24h ?? '—'}</div>
        <div className="text-xs text-charcoal/60 mt-0.5 flex items-center gap-1">
          <Activity className="h-3 w-3" />
          {isFr ? 'SMS 24h' : 'SMS 24h'}
        </div>
      </div>
    </div>
  );
}
