'use client';

import { useState, useCallback, useEffect, Component, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
} from '@dnd-kit/core';

// Error boundary — catches dnd-kit DOM crashes (Android Chrome / React 19 hydration)
class KanbanErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  render() { return this.state.crashed ? this.props.fallback : this.props.children; }
}
import { Package, Car, MapPin, Clock, CalendarDays, ChevronRight, ArrowRight, Loader2, UserX } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface KanbanBooking {
  id: string;
  version: number;
  serviceType: 'BOARDING' | 'PET_TAXI';
  status: string;
  startDate: string;
  endDate: string | null;
  arrivalTime: string | null;
  notes: string | null;
  clientName: string;
  clientId: string;
  pets: string;
}

interface Props {
  bookings: KanbanBooking[];
  locale: string;
}

const BOARDING_COLS = [
  { status: 'WAITLIST',    label: { fr: "Liste d'attente",      en: 'Waitlist' },          color: 'bg-orange-50 border-orange-200', dot: 'bg-orange-400' },
  { status: 'PENDING',     label: { fr: 'Demande reçue',       en: 'Request received' },  color: 'bg-amber-50  border-amber-200',  dot: 'bg-amber-400' },
  { status: 'CONFIRMED',   label: { fr: 'Séjour confirmé',      en: 'Stay confirmed' },    color: 'bg-blue-50   border-blue-200',   dot: 'bg-blue-400' },
  { status: 'IN_PROGRESS', label: { fr: 'Dans nos murs',        en: 'Currently staying' }, color: 'bg-green-50  border-green-200',  dot: 'bg-green-400' },
  { status: 'COMPLETED',   label: { fr: 'Séjour terminé',       en: 'Stay completed' },    color: 'bg-gray-50   border-gray-200',   dot: 'bg-gray-400' },
];

const TAXI_COLS = [
  { status: 'PENDING',     label: { fr: 'Transport planifié',              en: 'Transport planned' },    color: 'bg-amber-50  border-amber-200',  dot: 'bg-amber-400' },
  { status: 'CONFIRMED',   label: { fr: 'En route vers le point de départ', en: 'En route to pickup' },  color: 'bg-blue-50   border-blue-200',   dot: 'bg-blue-400' },
  { status: 'AT_PICKUP',   label: { fr: 'Sur place',                        en: 'At pickup point' },     color: 'bg-teal-50   border-teal-200',   dot: 'bg-teal-400' },
  { status: 'IN_PROGRESS', label: { fr: 'Animal à bord',                    en: 'Pet on board' },        color: 'bg-green-50  border-green-200',  dot: 'bg-green-400' },
  { status: 'COMPLETED',   label: { fr: 'Arrivé à destination',             en: 'Arrived' },             color: 'bg-gray-50   border-gray-200',   dot: 'bg-gray-400' },
];

// Centralisation des transitions par pipeline
const BOARDING_NEXT_STATUS: Record<string, string> = {
  WAITLIST:    'PENDING',     // promotion manuelle depuis liste d'attente
  PENDING:     'CONFIRMED',
  CONFIRMED:   'IN_PROGRESS', // Boarding n'a pas d'étape AT_PICKUP
  IN_PROGRESS: 'COMPLETED',
};

const TAXI_NEXT_STATUS: Record<string, string> = {
  PENDING:     'CONFIRMED',
  CONFIRMED:   'AT_PICKUP',
  AT_PICKUP:   'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

const ACTION_LABELS: Record<'BOARDING' | 'PET_TAXI', Record<string, { fr: string; en: string }>> = {
  BOARDING: {
    WAITLIST:    { fr: 'Promouvoir en attente',       en: 'Promote to pending' },
    PENDING:     { fr: 'Confirmer le séjour',        en: 'Confirm stay' },
    CONFIRMED:   { fr: 'Marquer dans nos murs',       en: 'Mark as staying' },
    IN_PROGRESS: { fr: 'Clôturer le séjour',          en: 'Close stay' },
  },
  PET_TAXI: {
    PENDING:     { fr: 'Véhicule en route vers le point de départ', en: 'Vehicle en route to pickup' },
    CONFIRMED:   { fr: 'Véhicule sur place',            en: 'Vehicle on site' },
    AT_PICKUP:   { fr: 'Animal à bord',                en: 'Pet on board' },
    IN_PROGRESS: { fr: 'Arrivé à destination',         en: 'Mark arrived' },
  },
};

// Statuts pour lesquels un bouton "No Show" est pertinent — uniquement si
// le séjour est confirmé ou en cours, jamais sur PENDING ou WAITLIST.
const NO_SHOW_ELIGIBLE_STATUSES = new Set(['CONFIRMED', 'IN_PROGRESS']);

function parseAddresses(notes: string | null): { departure: string | null; arrival: string | null } {
  if (!notes) return { departure: null, arrival: null };
  const departureMatch = notes.match(/Départ:\s*([^|]+)/);
  const arrivalMatch = notes.match(/Arrivée:\s*([^|]+)/);
  return {
    departure: departureMatch ? departureMatch[1].trim() : null,
    arrival: arrivalMatch ? arrivalMatch[1].trim() : null,
  };
}

function formatShortDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short' });
}

type ApplyTransition = (bookingId: string, currentStatus: string, currentVersion: number, newStatus: string) => Promise<void>;

function ActionButton({
  bookingId,
  bookingVersion,
  currentStatus,
  pipeline,
  locale,
  applyTransition,
}: {
  bookingId: string;
  bookingVersion: number;
  currentStatus: string;
  pipeline: 'BOARDING' | 'PET_TAXI';
  locale: string;
  applyTransition: ApplyTransition;
}) {
  const [loading, setLoading] = useState(false);
  const nextStatusMap = pipeline === 'BOARDING' ? BOARDING_NEXT_STATUS : TAXI_NEXT_STATUS;
  const nextStatus = nextStatusMap[currentStatus];
  const actionLabels = ACTION_LABELS[pipeline][currentStatus];
  if (!nextStatus || !actionLabels) return null;

  const label = locale === 'fr' ? actionLabels.fr : actionLabels.en;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      await applyTransition(bookingId, currentStatus, bookingVersion, nextStatus);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={loading}
      className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-charcoal/5 hover:bg-charcoal/10 text-charcoal border border-charcoal/10 hover:border-charcoal/20 transition-all disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <ArrowRight className="h-3 w-3 flex-shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

function NoShowButton({
  bookingId,
  bookingVersion,
  currentStatus,
  locale,
  applyTransition,
}: {
  bookingId: string;
  bookingVersion: number;
  currentStatus: string;
  locale: string;
  applyTransition: ApplyTransition;
}) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!NO_SHOW_ELIGIBLE_STATUSES.has(currentStatus)) return null;

  const isFr = locale === 'fr';

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await applyTransition(bookingId, currentStatus, bookingVersion, 'NO_SHOW');
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={loading}
        className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 hover:border-red-300 transition-all disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <UserX className="h-3 w-3 flex-shrink-0" />
        )}
        <span>No Show</span>
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isFr ? 'Confirmer le No Show' : 'Confirm No Show'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isFr
                ? "Marquer cette réservation comme No Show ? Cette action libère la place et ne compte pas dans les séjours du client."
                : "Mark this booking as No Show? This frees the slot and is not counted toward the client's stays."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmOpen(false)}>
              {isFr ? 'Annuler' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                handleConfirm();
              }}
            >
              {isFr ? 'Confirmer' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

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

function BoardingCardInner({ b, locale }: { b: KanbanBooking; locale: string }) {
  return (
    <>
      <div className="flex items-start justify-between gap-1 mb-2">
        <div>
          <p className="text-sm font-semibold text-charcoal leading-tight">{b.pets}</p>
          <p className="text-xs text-gray-500 mt-0.5">{b.clientName}</p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gold-400 flex-shrink-0 mt-0.5" />
      </div>
      <div className="flex items-center gap-1 text-xs text-gray-400">
        <CalendarDays className="h-3 w-3 flex-shrink-0" />
        <span>
          {formatShortDate(b.startDate, locale)}
          {b.endDate ? ` → ${formatShortDate(b.endDate, locale)}` : ''}
        </span>
      </div>
      <p className="text-[10px] font-mono text-gray-300 mt-2">{b.id.slice(0, 8)}</p>
    </>
  );
}

function TaxiCardInner({ b, locale }: { b: KanbanBooking; locale: string }) {
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

function BoardingCard({
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

function TaxiCard({
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

/** Desktop column — uses useDroppable, must be inside DndContext */
function DesktopColumn({
  col,
  bookings,
  locale,
  pipeline,
  applyTransition,
}: {
  col: { status: string; label: { fr: string; en: string }; color: string; dot: string };
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
function MobileColumn({
  col,
  bookings,
  locale,
  pipeline,
  applyTransition,
}: {
  col: { status: string; label: { fr: string; en: string }; color: string; dot: string };
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const cols = pipeline === 'BOARDING' ? BOARDING_COLS : TAXI_COLS;
  const filtered = bookings.filter((b) => b.serviceType === pipeline);

  // Optimistic status update: move card to new column immediately
  // Also increment version so the next PATCH sends the correct optimistic lock value.
  const handleStatusChange = useCallback((id: string, newStatus: string) => {
    setBookings(prev =>
      prev.map(b => b.id === id ? { ...b, status: newStatus, version: b.version + 1 } : b)
    );
  }, []);

  /**
   * applyTransition — single source of truth for status changes.
   * Used by both transition buttons AND drag-end handler.
   * Optimistically updates UI, calls PATCH, rolls back on 409 / error.
   */
  const applyTransition = useCallback<ApplyTransition>(async (bookingId, currentStatus, currentVersion, newStatus) => {
    // Optimistic update
    handleStatusChange(bookingId, newStatus);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, version: currentVersion }),
      });
      if (res.status === 409) {
        // Rollback
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: currentStatus, version: currentVersion } : b));
        toast({
          title: isFr
            ? "Cette réservation a été modifiée par quelqu'un d'autre. Veuillez rafraîchir."
            : 'This record was modified by someone else. Please refresh.',
          variant: 'destructive',
        });
        return;
      }
      if (!res.ok) throw new Error('Failed');
      toast({ title: isFr ? 'Statut mis à jour' : 'Status updated', variant: 'success' });
    } catch {
      // Rollback
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: currentStatus, version: currentVersion } : b));
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    }
  }, [handleStatusChange, isFr]);

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
      toast({
        title: isFr ? 'Transition non autorisée' : 'Transition not allowed',
        variant: 'destructive',
      });
      return;
    }

    void applyTransition(bookingId, booking.status, booking.version, targetStatus);
  };

  const activeBooking = activeId ? bookings.find(b => b.id === activeId) ?? null : null;

  const toggle = (
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
        {filtered.length} {isFr ? 'réservation(s)' : 'booking(s)'}
      </span>
    </div>
  );

  // Mobile: no DnD, no DndContext — plain scrollable columns with ActionButtons
  if (isMobile) {
    return (
      <div>
        {toggle}
        <div className="flex gap-3 overflow-x-auto pb-4">
          {cols.map((col) => (
            <MobileColumn
              key={col.status}
              col={col}
              bookings={filtered.filter((b) => b.status === col.status)}
              locale={locale}
              pipeline={pipeline}
              applyTransition={applyTransition}
            />
          ))}
        </div>
      </div>
    );
  }

  // Desktop: full DnD experience, wrapped in error boundary as safety net
  return (
    <div>
      {toggle}
      <KanbanErrorBoundary
        fallback={
          <div className="flex gap-3 overflow-x-auto pb-4">
            {cols.map((col) => (
              <MobileColumn
                key={col.status}
                col={col}
                bookings={filtered.filter((b) => b.status === col.status)}
                locale={locale}
                pipeline={pipeline}
                applyTransition={applyTransition}
              />
            ))}
          </div>
        }
      >
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {cols.map((col) => (
              <DesktopColumn
                key={col.status}
                col={col}
                bookings={filtered.filter((b) => b.status === col.status)}
                locale={locale}
                pipeline={pipeline}
                applyTransition={applyTransition}
              />
            ))}
          </div>
          <DragOverlay>
            {activeBooking ? (
              <div className="bg-white border-2 border-gold-400 rounded-xl p-3 shadow-2xl rotate-2 opacity-90 max-w-[280px]">
                {activeBooking.serviceType === 'BOARDING' ? (
                  <BoardingCardInner b={activeBooking} locale={locale} />
                ) : (
                  <TaxiCardInner b={activeBooking} locale={locale} />
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </KanbanErrorBoundary>
    </div>
  );
}
