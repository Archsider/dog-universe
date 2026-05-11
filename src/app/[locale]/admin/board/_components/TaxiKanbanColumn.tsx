'use client';

import { Inbox } from 'lucide-react';
import type { TaxiCard, TaxiStatusChangeHandler } from '../_lib/types';
import type { TaxiColConfig } from '../_lib/kanban-config';
import { TaxiKanbanCard } from './TaxiKanbanCard';

export function TaxiKanbanColumn({
  col,
  cards,
  locale,
  onStatusChange,
}: {
  col: TaxiColConfig;
  cards: TaxiCard[];
  locale: string;
  onStatusChange: TaxiStatusChangeHandler;
}) {
  const Icon = col.icon;
  const label = locale === 'fr' ? col.label.fr : col.label.en;
  const sublabel = locale === 'fr' ? col.sublabel.fr : col.sublabel.en;
  return (
    <div className="flex flex-col min-w-0">
      <div className={`flex items-center gap-2 sm:gap-2.5 px-3 py-2 sm:px-4 sm:py-3 lg:px-5 lg:py-4 rounded-t-lg ${col.color} border-b`}>
        <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 rounded-lg bg-white/70 flex items-center justify-center flex-shrink-0">
          <Icon className="h-3 w-3 text-charcoal/75" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm lg:text-base font-bold text-charcoal leading-tight truncate">{label}</p>
          <p className="text-[7px] sm:text-[8px] lg:text-[9px] text-charcoal/55 leading-tight mt-0.5 truncate">{sublabel}</p>
        </div>
        <span className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 px-1 rounded-full bg-white/70 text-[7px] sm:text-[8px] font-bold text-charcoal/70 flex-shrink-0">
          {cards.length}
        </span>
      </div>
      <div className="flex-1 bg-[#FEFCF9] rounded-b-lg p-2 space-y-2 min-h-[120px]">
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-gray-300 gap-1.5">
            <Inbox className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12" />
            <span className="text-[7px] sm:text-[8px] lg:text-[9px]">{locale === 'fr' ? 'Aucun trajet' : 'No rides'}</span>
          </div>
        ) : (
          cards.map((c) => (
            <TaxiKanbanCard key={c._taxiCardKey} b={c} locale={locale} onStatusChange={onStatusChange} />
          ))
        )}
      </div>
    </div>
  );
}
