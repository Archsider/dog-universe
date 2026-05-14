import { Car, PawPrint } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  isEn: boolean;
  statusLabels: Record<string, string>;
}

const LEGEND_COLORS: Array<{ statusKey: string; color: string }> = [
  { statusKey: 'PENDING', color: 'bg-amber-100 border-amber-200' },
  { statusKey: 'CONFIRMED', color: 'bg-green-100 border-green-200' },
  { statusKey: 'IN_PROGRESS', color: 'bg-blue-100 border-blue-200' },
  { statusKey: 'COMPLETED', color: 'bg-gray-100 border-gray-200' },
];

/**
 * Legend strip at the bottom of the calendar — explains the 4 status
 * background colours plus the boarding / taxi service icons.
 */
export function Legend({ isEn, statusLabels }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 border-t border-ivory-100 bg-ivory-50/50">
      <span className="text-xs text-charcoal/40 font-medium">
        {isEn ? 'Legend:' : 'Légende :'}
      </span>
      {LEGEND_COLORS.map(({ statusKey, color }) => (
        <div key={statusKey} className="flex items-center gap-1.5">
          <div className={cn('w-3 h-3 rounded border', color)} />
          <span className="text-xs text-charcoal/50">{statusLabels[statusKey]}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5 ml-2">
        <PawPrint className="h-3 w-3 text-charcoal/40" />
        <span className="text-xs text-charcoal/50">Boarding</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Car className="h-3 w-3 text-charcoal/40" />
        <span className="text-xs text-charcoal/50">Taxi</span>
      </div>
    </div>
  );
}
