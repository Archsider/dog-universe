'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import { toast } from '@/hooks/use-toast';

import { KanbanErrorBoundary } from './_components/KanbanActionButtons';
import { BoardingCardInner, TaxiCardInner } from './_components/KanbanCard';
import { DesktopColumn, MobileColumn } from './_components/KanbanColumn';
import { KanbanPipelineToggle } from './_components/KanbanPipelineToggle';
import { useKanbanTransition } from './_lib/useKanbanTransition';
import {
  BOARDING_COLS,
  TAXI_COLS,
  BOARDING_NEXT_STATUS,
  TAXI_NEXT_STATUS,
  type KanbanBooking,
} from './_lib/kanban-types';

export type { KanbanBooking };

interface Props {
  bookings: KanbanBooking[];
  locale: string;
}

export function ReservationsKanban({ bookings: initialBookings, locale }: Props) {
  const [pipeline, setPipeline] = useState<'BOARDING' | 'PET_TAXI'>('BOARDING');
  const [bookings, setBookings] = useState<KanbanBooking[]>(initialBookings);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Detect touch device — evaluated after hydration to avoid SSR mismatch.
  // On touch devices, dnd-kit's PointerSensor can crash React 19 hydration
  // (TypeError: parentNode null) on Android Chrome. We disable DnD on mobile;
  // ActionButton handles transitions on all screen sizes.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  const isFr = locale === 'fr';
  const applyTransition = useKanbanTransition(setBookings, locale);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const cols = pipeline === 'BOARDING' ? BOARDING_COLS : TAXI_COLS;
  const filtered = bookings.filter((b) => b.serviceType === pipeline);
  const colList = cols.map((col) => ({
    col,
    colBookings: filtered.filter((b) => b.status === col.status),
  }));

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const bookingId = String(active.id);
    const targetStatus = String(over.id);
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;
    if (booking.status === targetStatus) return;

    // Validate transition allowed by SAME NEXT_STATUS map used by buttons
    const nextMap = booking.serviceType === 'BOARDING' ? BOARDING_NEXT_STATUS : TAXI_NEXT_STATUS;
    const allowedNext = nextMap[booking.status];
    if (allowedNext !== targetStatus) {
      toast({ title: isFr ? 'Transition non autorisée' : 'Transition not allowed', variant: 'destructive' });
      return;
    }
    void applyTransition(bookingId, booking.status, booking.version, targetStatus);
  };

  const activeBooking = activeId ? bookings.find(b => b.id === activeId) ?? null : null;

  const toggle = (
    <KanbanPipelineToggle pipeline={pipeline} setPipeline={setPipeline} count={filtered.length} locale={locale} />
  );

  const mobileGrid = (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {colList.map(({ col, colBookings }) => (
        <MobileColumn key={col.status} col={col} bookings={colBookings} locale={locale} pipeline={pipeline} applyTransition={applyTransition} />
      ))}
    </div>
  );

  // Mobile: no DnD, no DndContext — plain scrollable columns with ActionButtons
  if (isMobile) {
    return <div>{toggle}{mobileGrid}</div>;
  }

  // Desktop: full DnD experience, wrapped in error boundary as safety net
  return (
    <div>
      {toggle}
      <KanbanErrorBoundary fallback={mobileGrid}>
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {colList.map(({ col, colBookings }) => (
              <DesktopColumn key={col.status} col={col} bookings={colBookings} locale={locale} pipeline={pipeline} applyTransition={applyTransition} />
            ))}
          </div>
          <DragOverlay>
            {activeBooking ? (
              <div className="bg-white border-2 border-gold-400 rounded-xl p-3 shadow-2xl rotate-2 opacity-90 max-w-[280px]">
                {activeBooking.serviceType === 'BOARDING'
                  ? <BoardingCardInner b={activeBooking} locale={locale} />
                  : <TaxiCardInner b={activeBooking} locale={locale} />}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </KanbanErrorBoundary>
    </div>
  );
}
