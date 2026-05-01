'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Package, Car, MapPin, Clock, CalendarDays, ChevronRight, ArrowRight, Loader2, UserX } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

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

function ActionButton({
  bookingId,
  bookingVersion,
  currentStatus,
  pipeline,
  locale,
  onStatusChange,
}: {
  bookingId: string;
  bookingVersion: number;
  currentStatus: string;
  pipeline: 'BOARDING' | 'PET_TAXI';
  locale: string;
  onStatusChange: (id: string, newStatus: string) => void;
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
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, version: bookingVersion }),
      });
      if (res.status === 409) {
        toast({
          title: locale === 'fr'
            ? 'Cette réservation a été modifiée par quelqu\'un d\'autre. Veuillez rafraîchir.'
            : 'This record was modified by someone else. Please refresh.',
          variant: 'destructive',
        });
        return;
      }
      if (!res.ok) throw new Error('Failed');
      onStatusChange(bookingId, nextStatus);
      toast({ title: locale === 'fr' ? 'Statut mis à jour' : 'Status updated', variant: 'success' });
    } catch {
      toast({ title: locale === 'fr' ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
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
  onStatusChange,
}: {
  bookingId: string;
  bookingVersion: number;
  currentStatus: string;
  locale: string;
  onStatusChange: (id: string, newStatus: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  if (!NO_SHOW_ELIGIBLE_STATUSES.has(currentStatus)) return null;

  const label = locale === 'fr' ? 'No Show' : 'No Show';
  const confirmMsg =
    locale === 'fr'
      ? "Marquer cette réservation comme No Show ? Cette action libère la place et ne compte pas dans les séjours du client."
      : "Mark this booking as No Show? This frees the slot and is not counted toward the client's stays.";

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(confirmMsg)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'NO_SHOW', version: bookingVersion }),
      });
      if (res.status === 409) {
        toast({
          title: locale === 'fr'
            ? 'Cette réservation a été modifiée par quelqu\'un d\'autre. Veuillez rafraîchir.'
            : 'This record was modified by someone else. Please refresh.',
          variant: 'destructive',
        });
        return;
      }
      if (!res.ok) throw new Error('Failed');
      onStatusChange(bookingId, 'NO_SHOW');
      toast({
        title: locale === 'fr' ? 'Marqué No Show' : 'Marked No Show',
        variant: 'success',
      });
    } catch {
      toast({ title: locale === 'fr' ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 hover:border-red-300 transition-all disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <UserX className="h-3 w-3 flex-shrink-0" />
      )}
      <span>{label}</span>
    </button>
  );
}

function BoardingCard({
  b,
  locale,
  onStatusChange,
}: {
  b: KanbanBooking;
  locale: string;
  onStatusChange: (id: string, newStatus: string) => void;
}) {
  return (
    <div className="bg-white border border-ivory-200 rounded-xl p-3 shadow-sm hover:border-gold-300 hover:shadow-md transition-all group">
      <Link href={`/${locale}/admin/reservations/${b.id}`} className="block">
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
      </Link>
      <ActionButton
        bookingId={b.id}
        bookingVersion={b.version}
        currentStatus={b.status}
        pipeline="BOARDING"
        locale={locale}
        onStatusChange={onStatusChange}
      />
      <NoShowButton
        bookingId={b.id}
        bookingVersion={b.version}
        currentStatus={b.status}
        locale={locale}
        onStatusChange={onStatusChange}
      />
    </div>
  );
}

function TaxiCard({
  b,
  locale,
  onStatusChange,
}: {
  b: KanbanBooking;
  locale: string;
  onStatusChange: (id: string, newStatus: string) => void;
}) {
  const { departure, arrival } = parseAddresses(b.notes);
  return (
    <div className="bg-white border border-ivory-200 rounded-xl p-3 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
      <Link href={`/${locale}/admin/reservations/${b.id}`} className="block">
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
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span>{b.arrivalTime}</span>
            </div>
          )}
        </div>
        <p className="text-[10px] font-mono text-gray-300 mt-2">{b.id.slice(0, 8)}</p>
      </Link>
      <ActionButton
        bookingId={b.id}
        bookingVersion={b.version}
        currentStatus={b.status}
        pipeline="PET_TAXI"
        locale={locale}
        onStatusChange={onStatusChange}
      />
      <NoShowButton
        bookingId={b.id}
        bookingVersion={b.version}
        currentStatus={b.status}
        locale={locale}
        onStatusChange={onStatusChange}
      />
    </div>
  );
}

function Column({
  col,
  bookings,
  locale,
  pipeline,
  onStatusChange,
}: {
  col: { status: string; label: { fr: string; en: string }; color: string; dot: string };
  bookings: KanbanBooking[];
  locale: string;
  pipeline: 'BOARDING' | 'PET_TAXI';
  onStatusChange: (id: string, newStatus: string) => void;
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
        {bookings.length === 0 ? (
          <p className="text-xs text-gray-300 text-center pt-4">{isFr ? 'Aucune' : 'None'}</p>
        ) : (
          bookings.map((b) =>
            pipeline === 'BOARDING' ? (
              <BoardingCard key={b.id} b={b} locale={locale} onStatusChange={onStatusChange} />
            ) : (
              <TaxiCard key={b.id} b={b} locale={locale} onStatusChange={onStatusChange} />
            )
          )
        )}
      </div>
    </div>
  );
}

export function ReservationsKanban({ bookings: initialBookings, locale }: Props) {
  const [pipeline, setPipeline] = useState<'BOARDING' | 'PET_TAXI'>('BOARDING');
  const [bookings, setBookings] = useState<KanbanBooking[]>(initialBookings);
  const isFr = locale === 'fr';

  const cols = pipeline === 'BOARDING' ? BOARDING_COLS : TAXI_COLS;
  const filtered = bookings.filter((b) => b.serviceType === pipeline);

  // Optimistic status update: move card to new column immediately
  const handleStatusChange = (id: string, newStatus: string) => {
    setBookings(prev =>
      prev.map(b => b.id === id ? { ...b, status: newStatus } : b)
    );
  };

  return (
    <div>
      {/* Pipeline toggle */}
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

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {cols.map((col) => (
          <Column
            key={col.status}
            col={col}
            bookings={filtered.filter((b) => b.status === col.status)}
            locale={locale}
            pipeline={pipeline}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>
    </div>
  );
}
