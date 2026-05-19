import { CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import type { CronWithStatus } from './types';
import { CRON_MAX_AGE_MS, relativeTime } from './health-utils';
import { CronTriggerButton } from './CronTriggerButton';

interface CronStatusSectionProps {
  cronStatuses: CronWithStatus[];
  isFr: boolean;
}

export function CronStatusSection({ cronStatuses, isFr }: CronStatusSectionProps) {
  return (
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
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1 text-xs ${isNeverAnomaly ? 'text-red-600' : isNever ? 'text-amber-700' : isOverdue ? 'text-amber-700' : 'text-gray-500'}`}>
                  <Clock className="h-3 w-3" />
                  {relativeTime(c.lastRun, isFr)}
                </span>
                {(isNever || isOverdue) && (
                  <CronTriggerButton name={c.name} isFr={isFr} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
