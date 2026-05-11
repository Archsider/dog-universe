'use client';

import { PawPrint, Car } from 'lucide-react';

export function BoardTabs({
  tab,
  setTab,
  pensionCount,
  taxiCount,
  pensionLabel,
  taxiLabel,
}: {
  tab: 'BOARDING' | 'PET_TAXI';
  setTab: (t: 'BOARDING' | 'PET_TAXI') => void;
  pensionCount: number;
  taxiCount: number;
  pensionLabel: string;
  taxiLabel: string;
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => setTab('BOARDING')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          tab === 'BOARDING'
            ? 'bg-charcoal text-white'
            : 'bg-white border border-ivory-200 text-charcoal/70 hover:text-charcoal'
        }`}
      >
        <PawPrint className="h-4 w-4" />
        {pensionLabel}
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'BOARDING' ? 'bg-white/20 text-white' : 'bg-ivory-100 text-charcoal/50'}`}>
          {pensionCount}
        </span>
      </button>
      <button
        onClick={() => setTab('PET_TAXI')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          tab === 'PET_TAXI'
            ? 'bg-charcoal text-white'
            : 'bg-white border border-ivory-200 text-charcoal/70 hover:text-charcoal'
        }`}
      >
        <Car className="h-4 w-4" />
        {taxiLabel}
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'PET_TAXI' ? 'bg-white/20 text-white' : 'bg-ivory-100 text-charcoal/50'}`}>
          {taxiCount}
        </span>
      </button>
    </div>
  );
}
