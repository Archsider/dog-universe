'use client';

import { useDroppable } from '@dnd-kit/core';
import { BoardingCard, TaxiCard } from './KanbanCard';
import { type KanbanBooking, type ApplyTransition } from '../_lib/kanban-types';

type ColDef = { status: string; label: { fr: string; en: string }; color: string; dot: string };

/** Desktop column — uses useDroppable, must be inside DndContext */
export function DesktopColumn({
  col,
  bookings,
  locale,
  pipeline,
  applyTransition,
}: {
  col: ColDef;
  bookings: KanbanBooking[];
  locale: string;
  pipeline: 'BOARDING' | 'PET_TAXI';
  applyTransition: ApplyTransition;
}) {
  const isFr = locale === 'fr';
  const label = isFr ? col.label.fr : col.label.en;
  const { isOver, setNodeRef } = useDroppable({ id: col.status });

  return (
    <div className="flex flex-col min-w-[260px] max-w-[280px] flex-shrink-0">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-t border-l border-r ${col.color}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot}`} />
        <span className="text-xs font-semibold text-charcoal flex-1">{label}</span>
        <span className="text-xs text-gray-400 font-medium">{bookings.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-b-xl border ${col.color} p-2 space-y-2 min-h-[120px] transition-all ${
          isOver ? 'ring-2 ring-gold-400 ring-inset bg-gold-50/40' : ''
        }`}
      >
        {bookings.length === 0
          ? <p className="text-xs text-gray-300 text-center pt-4">{isFr ? 'Aucune' : 'None'}</p>
          : bookings.map((b) =>
              pipeline === 'BOARDING'
                ? <BoardingCard key={b.id} b={b} locale={locale} applyTransition={applyTransition} isMobile={false} />
                : <TaxiCard key={b.id} b={b} locale={locale} applyTransition={applyTransition} isMobile={false} />
            )}
      </div>
    </div>
  );
}

/** Mobile column — no DnD hooks, safe on Android Chrome */
export function MobileColumn({
  col,
  bookings,
  locale,
  pipeline,
  applyTransition,
}: {
  col: ColDef;
  bookings: KanbanBooking[];
  locale: string;
  pipeline: 'BOARDING' | 'PET_TAXI';
  applyTransition: ApplyTransition;
}) {
  const isFr = locale === 'fr';
  const label = isFr ? col.label.fr : col.label.en;

  return (
    <div className="flex flex-col min-w-[260px] max-w-[280px] flex-shrink-0">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-t border-l border-r ${col.color}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot}`} />
        <span className="text-xs font-semibold text-charcoal flex-1">{label}</span>
        <span className="text-xs text-gray-400 font-medium">{bookings.length}</span>
      </div>
      <div className={`flex-1 rounded-b-xl border ${col.color} p-2 space-y-2 min-h-[120px]`}>
        {bookings.length === 0
          ? <p className="text-xs text-gray-300 text-center pt-4">{isFr ? 'Aucune' : 'None'}</p>
          : bookings.map((b) =>
              pipeline === 'BOARDING'
                ? <BoardingCard key={b.id} b={b} locale={locale} applyTransition={applyTransition} isMobile={true} />
                : <TaxiCard key={b.id} b={b} locale={locale} applyTransition={applyTransition} isMobile={true} />
            )}
      </div>
    </div>
  );
}
