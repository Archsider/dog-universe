'use client';

import { ArrowRight, ArrowLeft } from 'lucide-react';
import type { TaxiCard, TaxiStatusChangeHandler } from '../_lib/types';
import { ALLER_COLS, RETOUR_COLS } from '../_lib/kanban-config';
import { TaxiKanbanColumn } from './TaxiKanbanColumn';

export function TaxiKanban({
  allerCards,
  retourCards,
  locale,
  isFr,
  onStatusChange,
}: {
  allerCards: TaxiCard[];
  retourCards: TaxiCard[];
  locale: string;
  isFr: boolean;
  onStatusChange: TaxiStatusChangeHandler;
}) {
  return (
    <div className="space-y-6">
      {/* Section Aller (OUTBOUND + STANDALONE) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs sm:text-sm lg:text-base font-bold">
            <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
            {isFr ? 'Aller' : 'Outbound'}
          </span>
          <span className="text-[7px] sm:text-[8px] lg:text-[9px] text-gray-400">{allerCards.length} trajet{allerCards.length > 1 ? 's' : ''}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
          {ALLER_COLS.map((col) => (
            <TaxiKanbanColumn
              key={col.status}
              col={col}
              cards={allerCards.filter((c) => c._colStatus === col.status)}
              locale={locale}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-dashed border-gray-200" />

      {/* Section Retour (RETURN) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs sm:text-sm lg:text-base font-bold">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
            {isFr ? 'Retour' : 'Return'}
          </span>
          <span className="text-[7px] sm:text-[8px] lg:text-[9px] text-gray-400">{retourCards.length} trajet{retourCards.length > 1 ? 's' : ''}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
          {RETOUR_COLS.map((col) => (
            <TaxiKanbanColumn
              key={col.status}
              col={col}
              cards={retourCards.filter((c) => c._colStatus === col.status)}
              locale={locale}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
