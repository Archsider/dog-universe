'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, MapPin, CalendarDays, Clock } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { ActionButton, NoShowButton } from './KanbanActionButtons';
import {
  parseAddresses,
  formatShortDate,
  type KanbanBooking,
  type ApplyTransition,
} from '../_lib/kanban-types';

// ── Inner renderers (no hooks, pure display) ──────────────────────────────

export function BoardingCardInner({ b, locale }: { b: KanbanBooking; locale: string }) {
  const fr = locale !== 'en';
  return (
    <>
      <div className="flex items-start justify-between gap-1 mb-2">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-charcoal leading-tight">{b.pets}</p>
            {b.isWalkIn && (
              <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 font-medium">
                walk-in
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{b.clientName}</p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gold-400 flex-shrink-0 mt-0.5" />
      </div>
      <div className="flex items-center gap-1 text-xs text-gray-400">
        <CalendarDays className="h-3 w-3 flex-shrink-0" />
        {b.isOpenEnded ? (
          <span className="italic text-amber-600">
            {fr ? 'Walk-in ouvert' : 'Open-ended stay'}
          </span>
        ) : (
          <span>
            {formatShortDate(b.startDate, locale)}
            {b.endDate ? ` → ${formatShortDate(b.endDate, locale)}` : ''}
          </span>
        )}
      </div>
      <p className="text-[10px] font-mono text-gray-300 mt-2">{b.id.slice(0, 8)}</p>
    </>
  );
}

export function TaxiCardInner({ b, locale }: { b: KanbanBooking; locale: string }) {
  const { departure, arrival } = parseAddresses(b.notes);
  return (
    <>
      <div className="flex items-start justify-between gap-1 mb-2">
        <div>
          <p className="text-sm font-semibold text-charcoal leading-tight">{b.pets}</p>
          <p className="text-xs text-gray-500 mt-0.5">{b.clientName}</p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-400 flex-shrink-0 mt-0.5" />
      </div>
      {(departure || arrival) && (
        <div className="space-y-1 mb-2">
          {departure && (
            <div className="flex items-start gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3 flex-shrink-0 text-green-500 mt-px" />
              <span className="truncate">{departure}</span>
            </div>
          )}
          {arrival && (
            <div className="flex items-start gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3 flex-shrink-0 text-red-400 mt-px" />
              <span className="truncate">{arrival}</span>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <CalendarDays className="h-3 w-3 flex-shrink-0" />
          <span>{formatShortDate(b.startDate, locale)}</span>
        </div>
        {b.arrivalTime && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="h-3 w-3 flex-shrink-0 text-gray-400" />
            <span>{b.arrivalTime}</span>
          </div>
        )}
      </div>
      <p className="text-[10px] font-mono text-gray-300 mt-2">{b.id.slice(0, 8)}</p>
    </>
  );
}

// ── Card wrappers (navigation + optional DnD) ─────────────────────────────

/**
 * StaticCard — mobile fallback, no DnD. Click navigates to booking detail.
 * Rendered on touch devices to avoid dnd-kit crashing (Android Chrome / React 19).
 */
function StaticCard({
  booking,
  locale,
  children,
}: {
  booking: KanbanBooking;
  locale: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    router.push(`/${locale}/admin/reservations/${booking.id}`);
  };
  return (
    <div onClick={handleClick} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
      {children}
    </div>
  );
}

/**
 * DraggableCard — desktop only. Wraps a card with dnd-kit's useDraggable.
 * Activation distance (5px) means a quick click navigates while a real drag triggers DnD.
 */
function DraggableCard({
  booking,
  locale,
  children,
}: {
  booking: KanbanBooking;
  locale: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: booking.id,
    data: { booking },
  });

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    router.push(`/${locale}/admin/reservations/${booking.id}`);
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      style={{
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      {children}
    </div>
  );
}

// ── Composed cards ────────────────────────────────────────────────────────

export function BoardingCard({
  b,
  locale,
  applyTransition,
  isMobile,
}: {
  b: KanbanBooking;
  locale: string;
  applyTransition: ApplyTransition;
  isMobile: boolean;
}) {
  const CardWrapper = isMobile ? StaticCard : DraggableCard;
  return (
    <CardWrapper booking={b} locale={locale}>
      <div className="bg-white border border-ivory-200 rounded-xl p-3 shadow-sm hover:border-gold-300 hover:shadow-md transition-all group">
        <BoardingCardInner b={b} locale={locale} />
        <ActionButton
          bookingId={b.id}
          bookingVersion={b.version}
          currentStatus={b.status}
          pipeline="BOARDING"
          locale={locale}
          applyTransition={applyTransition}
        />
        <NoShowButton
          bookingId={b.id}
          bookingVersion={b.version}
          currentStatus={b.status}
          locale={locale}
          applyTransition={applyTransition}
        />
      </div>
    </CardWrapper>
  );
}

export function TaxiCard({
  b,
  locale,
  applyTransition,
  isMobile,
}: {
  b: KanbanBooking;
  locale: string;
  applyTransition: ApplyTransition;
  isMobile: boolean;
}) {
  const CardWrapper = isMobile ? StaticCard : DraggableCard;
  return (
    <CardWrapper booking={b} locale={locale}>
      <div className="bg-white border border-ivory-200 rounded-xl p-3 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
        <TaxiCardInner b={b} locale={locale} />
        <ActionButton
          bookingId={b.id}
          bookingVersion={b.version}
          currentStatus={b.status}
          pipeline="PET_TAXI"
          locale={locale}
          applyTransition={applyTransition}
        />
        <NoShowButton
          bookingId={b.id}
          bookingVersion={b.version}
          currentStatus={b.status}
          locale={locale}
          applyTransition={applyTransition}
        />
      </div>
    </CardWrapper>
  );
}
