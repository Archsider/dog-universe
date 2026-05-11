'use client';

import type { BookingCard } from '../_lib/types';
import { PENSION_KANBAN_COLS } from '../_lib/kanban-config';
import { Column } from './Column';

export function BoardingKanban({
  pending,
  confirmed,
  inProgress,
  completed,
  locale,
}: {
  pending: BookingCard[];
  confirmed: BookingCard[];
  inProgress: BookingCard[];
  completed: BookingCard[];
  locale: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
      <Column col={PENSION_KANBAN_COLS[0]} cards={pending}    locale={locale} />
      <Column col={PENSION_KANBAN_COLS[1]} cards={confirmed}  locale={locale} />
      <Column col={PENSION_KANBAN_COLS[2]} cards={inProgress} locale={locale} />
      <Column col={PENSION_KANBAN_COLS[3]} cards={completed}  locale={locale} />
    </div>
  );
}
