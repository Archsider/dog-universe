'use client';

import { Package, Car } from 'lucide-react';

export function KanbanPipelineToggle({
  pipeline,
  setPipeline,
  count,
  locale,
}: {
  pipeline: 'BOARDING' | 'PET_TAXI';
  setPipeline: (p: 'BOARDING' | 'PET_TAXI') => void;
  count: number;
  locale: string;
}) {
  const isFr = locale === 'fr';
  return (
    <div className="flex gap-2 mb-4">
      <button
        onClick={() => setPipeline('BOARDING')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          pipeline === 'BOARDING'
            ? 'bg-gold-500 text-white shadow-sm'
            : 'bg-white border border-ivory-200 text-gray-600 hover:border-gold-300'
        }`}
      >
        <Package className="h-4 w-4" />
        {isFr ? 'Pension' : 'Boarding'}
      </button>
      <button
        onClick={() => setPipeline('PET_TAXI')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          pipeline === 'PET_TAXI'
            ? 'bg-blue-500 text-white shadow-sm'
            : 'bg-white border border-ivory-200 text-gray-600 hover:border-blue-300'
        }`}
      >
        <Car className="h-4 w-4" />
        Pet Taxi
      </button>
      <span className="ml-auto text-xs text-gray-400 self-center">
        {count} {isFr ? 'réservation(s)' : 'booking(s)'}
      </span>
    </div>
  );
}
