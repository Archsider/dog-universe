'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  PawPrint, Car, Home, ArrowRight, ArrowLeft, Scissors, Loader2, MapPin, Clock,
} from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface BookingCard {
  id: string;
  serviceType: 'BOARDING' | 'PET_TAXI';
  status: string;
  startDate: string;
  endDate: string | null;
  arrivalTime: string | null;
  totalPrice: number;
  clientName: string;
  clientId: string;
  pets: { name: string; species: string }[];
  taxiType: string | null;
  includeGrooming: boolean;
  taxiGoEnabled: boolean;
  taxiGoStatus: string | null;
  taxiGoDate: string | null;
  taxiGoTime: string | null;
  taxiReturnEnabled: boolean;
  taxiReturnStatus: string | null;
  taxiReturnDate: string | null;
  taxiReturnTime: string | null;
  taxiGoTripId: string | null;
  taxiReturnTripId: string | null;
  standaloneTripId: string | null;
  standaloneTripStatus: string | null;
  taxiGoAddress: string | null;
  taxiReturnAddress: string | null;
  standaloneTripAddress: string | null;
  notes: string | null;
  updatedAt: string;
}

type TaxiCard = BookingCard & {
  _cardType: 'GO' | 'RETURN' | null;
  _colStatus: string;
  _taxiCardKey: string;
};

type AllBoardingTaxi = {
  bookingId: string;
  clientName: string;
  pets: string;
  direction: 'GO' | 'RETURN';
  time: string | null;
  date: string;
  bookingStartDate: string;
  bookingEndDate: string | null;
};

interface Stats {
  activeBoarders: number;
  dogCount: number;
  catCount: number;
  todayArrivals: number;
  todayDepartures: number;
  todayTaxis: number;
  todayArrivalDetails: { id: string; clientName: string; pets: string; arrivalTime: string | null }[];
  todayDepartureDetails: { id: string; clientName: string; pets: string }[];
  allBoardingTaxis: AllBoardingTaxi[];
  upcomingTaxiDetails: { id: string; bookingId: string; clientName: string; pets: string; startDate: string; time: string | null; direction: 'GO' | 'RETURN' | null }[];
  upcomingDepartureDetails: { id: string; clientName: string; pets: string; endDate: string }[];
}

interface Props {
  locale: string;
  bookings: BookingCard[];
  stats: Stats;
}

const SPECIES_EMOJI: Record<string, string> = { DOG: '🐕', CAT: '🐈' };

const TAXI_LABELS: Record<string, Record<string, string>> = {
  STANDARD: { fr: 'Standard', en: 'Standard' },
  VET:      { fr: 'Vétérinaire', en: 'Veterinary' },
  AIRPORT:  { fr: 'Aéroport', en: 'Airport' },
};

function formatDateShortLocal(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-MA' : 'en-US', {
    day: 'numeric', month: 'short',
  }).format(new Date(iso));
}

function nightCount(start: string, end: string | null): number {
  if (!end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
}

function getInitials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

function normDateTs(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Categorize bookings into 4 kanban columns
function categorize(bookings: BookingCard[], serviceType: 'BOARDING' | 'PET_TAXI') {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  const filtered = bookings.filter((b) => b.serviceType === serviceType);

  const pending: BookingCard[] = [];
  const confirmed: BookingCard[] = [];
  const inProgress: BookingCard[] = [];
  const completed: BookingCard[] = [];

  for (const b of filtered) {
    if (b.status === 'PENDING') { pending.push(b); continue; }
    if (b.status === 'COMPLETED') { completed.push(b); continue; }
    // CONFIRMED or IN_PROGRESS
    const start = new Date(b.startDate);
    const end = b.endDate ? new Date(b.endDate) : null;
    const started = start <= now;
    const notEnded = !end || end >= todayStart;
    if (started && notEnded) {
      inProgress.push(b);
    } else {
      confirmed.push(b);
    }
  }

  return { pending, confirmed, inProgress, completed };
}

function KanbanCard({ b, locale, href }: { b: BookingCard; locale: string; href: string }) {
  const isFr = locale === 'fr';
  const nights = nightCount(b.startDate, b.endDate);
  const petLine = b.pets.map((p) => `${SPECIES_EMOJI[p.species] ?? '🐾'} ${p.name}`).join(' · ');
  const hasTaxi = b.taxiGoEnabled || b.taxiReturnEnabled;
  const taxiBadgeLabel = b.taxiGoEnabled && b.taxiReturnEnabled
    ? 'Aller + Retour'
    : b.taxiGoEnabled
    ? 'Aller'
    : 'Retour';

  return (
    <Link
      href={href}
      className="block bg-white border border-ivory-200 rounded-xl p-3.5 hover:border-gold-300 hover:shadow-md transition-all group"
    >
      {/* Client */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-gold-100 flex items-center justify-center text-[10px] font-bold text-gold-700 flex-shrink-0">
          {getInitials(b.clientName)}
        </div>
        <span className="text-sm font-semibold text-charcoal truncate">{b.clientName}</span>
        <ArrowRight className="h-3 w-3 text-gray-300 group-hover:text-gold-500 ml-auto flex-shrink-0 transition-colors" />
      </div>

      {/* Pets */}
      <p className="text-xs text-gray-500 mb-2 truncate">{petLine}</p>

      {/* Dates */}
      <div className="text-xs text-charcoal/70 mb-2">
        {b.serviceType === 'BOARDING' ? (
          <span>
            {formatDateShortLocal(b.startDate, locale)}
            {b.endDate && ` → ${formatDateShortLocal(b.endDate, locale)}`}
            {nights > 0 && (
              <span className="ml-1 text-gray-400">({nights} {isFr ? `nuit${nights > 1 ? 's' : ''}` : `night${nights > 1 ? 's' : ''}`})</span>
            )}
          </span>
        ) : (
          <span>
            {formatDateShortLocal(b.startDate, locale)}
            {b.arrivalTime && <span className="ml-1 text-gray-400">à {b.arrivalTime}</span>}
          </span>
        )}
      </div>

      {/* Footer: badges + price */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {b.includeGrooming && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
            <Scissors className="h-2.5 w-2.5" />
            {isFr ? 'Toilettage' : 'Grooming'}
          </span>
        )}
        {hasTaxi && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">
            🚗 {taxiBadgeLabel}
          </span>
        )}
        {b.taxiType && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
            {TAXI_LABELS[b.taxiType]?.[locale] ?? b.taxiType}
          </span>
        )}
        <span className="ml-auto text-xs font-semibold text-gold-700">{formatMAD(b.totalPrice)}</span>
      </div>
    </Link>
  );
}

interface ColumnProps {
  title: string;
  count: number;
  cards: BookingCard[];
  color: string;
  dotColor: string;
  locale: string;
}

function Column({ title, count, cards, color, dotColor, locale }: ColumnProps) {
  return (
    <div className="flex flex-col min-w-[240px] w-[240px] flex-shrink-0">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${color} border-b`}>
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-xs font-semibold text-charcoal flex-1">{title}</span>
        <span className="text-xs font-bold text-charcoal/50">{count}</span>
      </div>
      <div className="flex-1 bg-ivory-50/80 rounded-b-lg p-2 space-y-2 min-h-[120px]">
        {cards.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-gray-300">—</div>
        ) : (
          cards.map((b) => (
            <KanbanCard
              key={b.id}
              b={b}
              locale={locale}
              href={`/${locale}/admin/reservations/${b.id}`}
            />
          ))
        )}
      </div>
    </div>
  );
}

function BoardingTaxiCard({ t, locale }: { t: AllBoardingTaxi; locale: string }) {
  const isFr = locale === 'fr';
  const dirLabel = t.direction === 'GO' ? (isFr ? 'Aller' : 'Go') : (isFr ? 'Retour' : 'Return');
  const timeLabel = t.time ?? (isFr ? 'À confirmer' : 'TBD');

  return (
    <Link
      href={`/${locale}/admin/reservations/${t.bookingId}`}
      className="block bg-white border border-ivory-200 rounded-xl p-3 hover:border-orange-300 hover:shadow-sm transition-all"
    >
      <p className="text-sm font-medium text-charcoal truncate">
        {t.clientName}{' '}
        <span className="font-normal text-charcoal/55">— {t.pets}</span>
      </p>
      <p className="text-xs text-charcoal/70 mt-1">
        🚗 {dirLabel} ·{' '}
        {t.time
          ? <span className="font-semibold text-charcoal">{t.time}</span>
          : <span className="italic text-charcoal/40">{timeLabel}</span>
        }
      </p>
      <p className="text-xs text-charcoal/40 mt-0.5">
        {formatDateShortLocal(t.bookingStartDate, locale)}
        {t.bookingEndDate && ` → ${formatDateShortLocal(t.bookingEndDate, locale)}`}
      </p>
    </Link>
  );
}

// ─── PET TAXI Kanban ───────────────────────────────────────────────────────

// ALLER = OUTBOUND + STANDALONE
const ALLER_COLS = [
  { status: 'PLANNED',            label: { fr: 'Planifié',             en: 'Planned' },            color: 'bg-amber-50 border-amber-200',   dot: 'bg-amber-400' },
  { status: 'EN_ROUTE_TO_CLIENT', label: { fr: 'En route vers client', en: 'En route to client' }, color: 'bg-sky-50 border-sky-200',       dot: 'bg-sky-500' },
  { status: 'ON_SITE_CLIENT',     label: { fr: 'Sur place',            en: 'On site' },             color: 'bg-teal-50 border-teal-200',     dot: 'bg-teal-500' },
  { status: 'ANIMAL_ON_BOARD',    label: { fr: 'Animal à bord',        en: 'Pet on board' },        color: 'bg-cyan-50 border-cyan-200',     dot: 'bg-cyan-600' },
  { status: 'ARRIVED_AT_PENSION', label: { fr: 'Arrivé à la pension',  en: 'At pension' },          color: 'bg-green-50 border-green-200',   dot: 'bg-green-500' },
];

// RETOUR = RETURN uniquement
const RETOUR_COLS = [
  { status: 'PLANNED',            label: { fr: 'Planifié',              en: 'Planned' },             color: 'bg-amber-50 border-amber-200',   dot: 'bg-amber-400' },
  { status: 'ANIMAL_ON_BOARD',    label: { fr: 'Animal à bord',         en: 'Pet on board' },        color: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  { status: 'EN_ROUTE_TO_CLIENT', label: { fr: 'En route vers client',  en: 'En route to client' },  color: 'bg-amber-100 border-amber-300',  dot: 'bg-amber-600' },
  { status: 'ARRIVED_AT_CLIENT',  label: { fr: 'Arrivé chez le client', en: 'At client' },           color: 'bg-green-50 border-green-200',   dot: 'bg-green-500' },
];

const ALLER_NEXT: Record<string, string> = {
  PLANNED:            'EN_ROUTE_TO_CLIENT',
  EN_ROUTE_TO_CLIENT: 'ON_SITE_CLIENT',
  ON_SITE_CLIENT:     'ANIMAL_ON_BOARD',
  ANIMAL_ON_BOARD:    'ARRIVED_AT_PENSION',
};

const RETOUR_NEXT: Record<string, string> = {
  PLANNED:            'ANIMAL_ON_BOARD',
  ANIMAL_ON_BOARD:    'EN_ROUTE_TO_CLIENT',
  EN_ROUTE_TO_CLIENT: 'ARRIVED_AT_CLIENT',
};

const ALLER_ACTION_LABELS: Record<string, { fr: string; en: string }> = {
  PLANNED:            { fr: 'Véhicule en route vers le client', en: 'Vehicle en route to client' },
  EN_ROUTE_TO_CLIENT: { fr: 'Véhicule sur place',              en: 'Vehicle on site' },
  ON_SITE_CLIENT:     { fr: 'Animal à bord',                   en: 'Pet on board' },
  ANIMAL_ON_BOARD:    { fr: 'Arrivé à la pension',             en: 'Arrived at pension' },
};

const RETOUR_ACTION_LABELS: Record<string, { fr: string; en: string }> = {
  PLANNED:            { fr: 'Animal à bord',           en: 'Pet on board' },
  ANIMAL_ON_BOARD:    { fr: 'En route vers le client', en: 'En route to client' },
  EN_ROUTE_TO_CLIENT: { fr: 'Arrivé chez le client',  en: 'Arrived at client' },
};

function parseAddresses(notes: string | null): { departure: string | null; arrival: string | null } {
  if (!notes) return { departure: null, arrival: null };
  const departureMatch = notes.match(/Départ:\s*([^|]+)/);
  const arrivalMatch = notes.match(/Arrivée:\s*([^|]+)/);
  return {
    departure: departureMatch ? departureMatch[1].trim() : null,
    arrival: arrivalMatch ? arrivalMatch[1].trim() : null,
  };
}

function TaxiKanbanCard({
  b,
  locale,
  onStatusChange,
}: {
  b: TaxiCard;
  locale: string;
  onStatusChange: (id: string, newStatus: string, field?: 'taxiGoStatus' | 'taxiReturnStatus') => void;
}) {
  const isFr = locale === 'fr';
  const [loading, setLoading] = useState(false);
  const isRetour = b._cardType === 'RETURN';
  const nextStatus = (isRetour ? RETOUR_NEXT : ALLER_NEXT)[b._colStatus];
  const actionLabel = nextStatus ? (isRetour ? RETOUR_ACTION_LABELS : ALLER_ACTION_LABELS)[b._colStatus] : null;
  const { departure, arrival } = parseAddresses(b.notes);
  const petLine = b.pets.map((p) => `${SPECIES_EMOJI[p.species] ?? '🐾'} ${p.name}`).join(' · ');

  const handleAction = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!nextStatus) return;
    setLoading(true);
    try {
      const tripId = b._cardType === 'GO'
        ? b.taxiGoTripId
        : b._cardType === 'RETURN'
        ? b.taxiReturnTripId
        : b.standaloneTripId;
      if (!tripId) throw new Error('No tripId');
      const res = await fetch(`/api/admin/taxi-trips/${tripId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      const field = b._cardType === 'GO' ? 'taxiGoStatus' : b._cardType === 'RETURN' ? 'taxiReturnStatus' : undefined;
      onStatusChange(b.id, nextStatus, field);
      toast({ title: isFr ? 'Statut mis à jour' : 'Status updated', variant: 'success' });
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-ivory-200 rounded-xl p-3 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
      <Link href={`/${locale}/admin/reservations/${b.id}`} className="block">
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <div>
            <p className="text-sm font-semibold text-charcoal leading-tight">{b.clientName}</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{petLine}</p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-400 flex-shrink-0 mt-0.5" />
        </div>
        {(departure || arrival) && (
          <div className="space-y-0.5 mb-1.5">
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
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{formatDateShortLocal(
            b._cardType === 'GO'
              ? (b.taxiGoDate ?? b.startDate)
              : b._cardType === 'RETURN'
              ? (b.taxiReturnDate ?? b.startDate)
              : b.startDate,
            locale
          )}</span>
          {(b._cardType === 'GO' ? b.taxiGoTime : b._cardType === 'RETURN' ? b.taxiReturnTime : b.arrivalTime) && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {b._cardType === 'GO' ? b.taxiGoTime : b._cardType === 'RETURN' ? b.taxiReturnTime : b.arrivalTime}
            </span>
          )}
          {b.taxiType && (
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
              {TAXI_LABELS[b.taxiType]?.[locale] ?? b.taxiType}
            </span>
          )}
          {b._cardType && (
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">
              🚗 {b._cardType === 'GO' ? (isFr ? 'Aller' : 'Go') : (isFr ? 'Retour' : 'Return')}
            </span>
          )}
        </div>
      </Link>
      {actionLabel && (
        <button
          onClick={handleAction}
          disabled={loading}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium bg-charcoal/5 hover:bg-charcoal/10 text-charcoal border border-charcoal/10 hover:border-charcoal/20 transition-all disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ArrowRight className="h-3 w-3 flex-shrink-0" />
          )}
          <span className="truncate">{isFr ? actionLabel.fr : actionLabel.en}</span>
        </button>
      )}
    </div>
  );
}

function TaxiKanbanColumn({
  col,
  cards,
  locale,
  onStatusChange,
}: {
  col: { status: string; label: { fr: string; en: string }; color: string; dot: string };
  cards: TaxiCard[];
  locale: string;
  onStatusChange: (id: string, newStatus: string, field?: 'taxiGoStatus' | 'taxiReturnStatus') => void;
}) {
  const label = locale === 'fr' ? col.label.fr : col.label.en;
  return (
    <div className="flex flex-col min-w-[220px] w-[220px] flex-shrink-0">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${col.color} border-b`}>
        <span className={`w-2 h-2 rounded-full ${col.dot}`} />
        <span className="text-xs font-semibold text-charcoal flex-1 leading-tight">{label}</span>
        <span className="text-xs font-bold text-charcoal/50">{cards.length}</span>
      </div>
      <div className="flex-1 bg-ivory-50/80 rounded-b-lg p-2 space-y-2 min-h-[120px]">
        {cards.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-gray-300">—</div>
        ) : (
          cards.map((c) => (
            <TaxiKanbanCard key={c._taxiCardKey} b={c} locale={locale} onStatusChange={onStatusChange} />
          ))
        )}
      </div>
    </div>
  );
}

export default function BoardView({ locale, bookings: initialBookings, stats }: Props) {
  const [tab, setTab] = useState<'BOARDING' | 'PET_TAXI'>('BOARDING');
  const [bookings, setBookings] = useState<BookingCard[]>(initialBookings);
  const isFr = locale === 'fr';

  const { pending, confirmed, inProgress, completed } = categorize(bookings, 'BOARDING');

  // Optimistic update for taxi status changes
  const handleTaxiStatusChange = (id: string, newStatus: string, field?: 'taxiGoStatus' | 'taxiReturnStatus') => {
    setBookings(prev => prev.map(b => {
      if (b.id !== id) return b;
      if (field === 'taxiGoStatus') return { ...b, taxiGoStatus: newStatus };
      if (field === 'taxiReturnStatus') return { ...b, taxiReturnStatus: newStatus };
      return { ...b, status: newStatus };
    }));
  };

  // Build unified taxi cards: boarding add-ons + standalone PET_TAXI
  const taxiCards: TaxiCard[] = [];
  for (const b of bookings) {
    if (b.serviceType === 'BOARDING') {
      if (b.taxiGoEnabled) {
        taxiCards.push({ ...b, _cardType: 'GO', _colStatus: b.taxiGoStatus ?? 'PLANNED', _taxiCardKey: `${b.id}-GO` });
      }
      if (b.taxiReturnEnabled) {
        taxiCards.push({ ...b, _cardType: 'RETURN', _colStatus: b.taxiReturnStatus ?? 'PLANNED', _taxiCardKey: `${b.id}-RETURN` });
      }
    } else if (b.serviceType === 'PET_TAXI') {
      taxiCards.push({ ...b, _cardType: null, _colStatus: b.standaloneTripStatus ?? 'PLANNED', _taxiCardKey: b.id });
    }
  }
  const TERMINAL = new Set(['ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT']);
  const taxiTabCount = taxiCards.filter((c) => !TERMINAL.has(c._colStatus)).length;
  const allerCards = taxiCards.filter((c) => c._cardType === 'GO' || c._cardType === null);
  const retourCards = taxiCards.filter((c) => c._cardType === 'RETURN');

  // Compute date buckets for boarding taxi add-on sections
  const todayTs = new Date();
  todayTs.setHours(0, 0, 0, 0);
  const sevenDaysTs = new Date(todayTs);
  sevenDaysTs.setDate(sevenDaysTs.getDate() + 7);

  const sortByTimeAsc = (a: AllBoardingTaxi, b: AllBoardingTaxi) => {
    if (a.time && b.time) return a.time.localeCompare(b.time);
    return a.time ? -1 : b.time ? 1 : 0;
  };
  const sortByDateThenTime = (a: AllBoardingTaxi, b: AllBoardingTaxi) => {
    const da = normDateTs(a.date);
    const db = normDateTs(b.date);
    if (da !== db) return da - db;
    return sortByTimeAsc(a, b);
  };

  const todayBoardingTaxisList = stats.allBoardingTaxis
    .filter((t) => normDateTs(t.date) === todayTs.getTime())
    .sort(sortByTimeAsc);

  const l = {
    title: isFr ? 'Tableau opérationnel' : 'Operations Board',
    subtitle: isFr ? 'Vue en temps réel des séjours et trajets' : 'Real-time view of stays and rides',
    activeBoarders: isFr ? 'Pensionnaires actifs' : 'Active boarders',
    arrivals: isFr ? "Arrivées aujourd'hui" : "Today's arrivals",
    departures: isFr ? "Départs aujourd'hui" : "Today's departures",
    taxis: isFr ? "Taxis aujourd'hui" : "Today's taxis",
    pension: isFr ? 'Pension' : 'Boarding',
    petTaxi: 'Pet Taxi',
    colPending: isFr ? 'En attente' : 'Pending',
    colConfirmed: isFr ? 'Confirmé' : 'Confirmed',
    colInProgress: isFr ? 'En cours' : 'In progress',
    colCompleted: isFr ? 'Terminé (7j)' : 'Completed (7d)',
    at: isFr ? 'à' : 'at',
    taxiToday: isFr ? "Aujourd'hui" : 'Today',
    taxiSoon: isFr ? 'À venir — 7 prochains jours' : 'Upcoming — next 7 days',
    taxiLater: isFr ? 'Plus tard' : 'Later',
    noTaxi: isFr ? 'Aucun taxi planifié' : 'No taxi scheduled',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <p className="text-sm text-charcoal/50 mt-1">{l.subtitle}</p>
      </div>

      {/* En ce moment — stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
              <Home className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold text-charcoal">{stats.activeBoarders}</p>
              <p className="text-xs text-charcoal/50">{l.activeBoarders}</p>
            </div>
          </div>
          {(stats.dogCount > 0 || stats.catCount > 0) && (
            <p className="text-xs text-gray-400 mt-2 pl-12">
              {stats.dogCount > 0 && `🐕 ${stats.dogCount}`}
              {stats.dogCount > 0 && stats.catCount > 0 && ' · '}
              {stats.catCount > 0 && `🐈 ${stats.catCount}`}
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <ArrowRight className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold text-charcoal">{stats.todayArrivals}</p>
              <p className="text-xs text-charcoal/50">{l.arrivals}</p>
            </div>
          </div>
          {stats.todayArrivalDetails.length > 0 && (
            <ul className="mt-2 space-y-0.5 pl-12">
              {stats.todayArrivalDetails.slice(0, 3).map((d) => (
                <li key={d.id} className="text-xs text-gray-500 truncate">
                  {d.clientName} — {d.pets}
                  {d.arrivalTime && <span className="text-gray-400"> {l.at} {d.arrivalTime}</span>}
                </li>
              ))}
              {stats.todayArrivalDetails.length > 3 && (
                <li className="text-xs text-gray-400">+{stats.todayArrivalDetails.length - 3} autres</li>
              )}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
              <ArrowLeft className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold text-charcoal">{stats.todayDepartures}</p>
              <p className="text-xs text-charcoal/50">{l.departures}</p>
            </div>
          </div>
          {stats.todayDepartureDetails.length > 0 && (
            <ul className="mt-2 space-y-0.5 pl-12">
              {stats.todayDepartureDetails.slice(0, 3).map((d) => (
                <li key={d.id} className="text-xs text-gray-500 truncate">
                  {d.clientName} — {d.pets}
                </li>
              ))}
              {stats.todayDepartureDetails.length > 3 && (
                <li className="text-xs text-gray-400">+{stats.todayDepartureDetails.length - 3} autres</li>
              )}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
              <Car className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold text-charcoal">{stats.todayTaxis}</p>
              <p className="text-xs text-charcoal/50">{l.taxis}</p>
            </div>
          </div>
          {todayBoardingTaxisList.length > 0 && (
            <ul className="mt-2 space-y-0.5 pl-12">
              {todayBoardingTaxisList.slice(0, 3).map((t) => (
                <li key={`${t.bookingId}-${t.direction}`} className="text-xs text-gray-500 truncate">
                  {t.clientName} — {t.pets}
                  {t.time && <span className="text-gray-400"> {l.at} {t.time}</span>}
                </li>
              ))}
              {todayBoardingTaxisList.length > 3 && (
                <li className="text-xs text-gray-400">+{todayBoardingTaxisList.length - 3} autres</li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Départs à venir — boardings ending in the next 7 days */}
      {stats.upcomingDepartureDetails.length > 0 && (
        <div className="bg-white rounded-xl border border-purple-100 shadow-card p-4">
          <h3 className="text-sm font-semibold text-charcoal mb-3 flex items-center gap-2">
            <ArrowLeft className="h-4 w-4 text-purple-600" />
            {isFr ? 'Départs à venir — 7 prochains jours' : 'Upcoming departures — next 7 days'}
          </h3>
          <div className="space-y-2">
            {stats.upcomingDepartureDetails.map((d) => (
              <Link
                key={d.id}
                href={`/${locale}/admin/reservations/${d.id}`}
                className="flex items-center gap-1.5 text-sm hover:text-gold-700 transition-colors"
              >
                <span className="text-xs font-semibold text-purple-700 min-w-[72px]">
                  {formatDateShortLocal(d.endDate, locale)}
                </span>
                <span className="text-charcoal/30">—</span>
                <span className="font-medium text-charcoal">{d.clientName}</span>
                <span className="text-charcoal/30">—</span>
                <span className="text-charcoal/70">{d.pets}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pet Taxi à venir — standalone taxis + boarding taxi add-ons in the next 7 days */}
      {stats.upcomingTaxiDetails.length > 0 && (
        <div className="bg-white rounded-xl border border-blue-100 shadow-card p-4">
          <h3 className="text-sm font-semibold text-charcoal mb-3 flex items-center gap-2">
            <Car className="h-4 w-4 text-blue-600" />
            {l.taxiSoon}
          </h3>
          <div className="space-y-2">
            {stats.upcomingTaxiDetails.map((d) => (
              <Link
                key={d.id}
                href={`/${locale}/admin/reservations/${d.bookingId}`}
                className="flex items-center gap-1.5 text-sm hover:text-gold-700 transition-colors flex-wrap"
              >
                <span className="text-xs font-semibold text-blue-700 min-w-[72px]">
                  {formatDateShortLocal(d.startDate, locale)}
                </span>
                <span className="text-charcoal/30">—</span>
                <span className="font-medium text-charcoal">{d.clientName}</span>
                <span className="text-charcoal/30">—</span>
                <span className="text-charcoal/70">{d.pets}</span>
                {d.direction && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">
                    🚗 {d.direction === 'GO' ? (isFr ? 'Aller' : 'Go') : (isFr ? 'Retour' : 'Return')}
                  </span>
                )}
                {d.time && (
                  <span className="text-charcoal/40 text-xs ml-1">{isFr ? 'à' : 'at'} {d.time}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pet Taxi du jour — taxi add-ons happening today */}
      {todayBoardingTaxisList.length > 0 && (
        <div className="bg-white rounded-xl border border-orange-100 shadow-card p-4">
          <h3 className="text-sm font-semibold text-charcoal mb-3 flex items-center gap-2">
            <Car className="h-4 w-4 text-orange-600" />
            {isFr ? 'Pet Taxi du jour' : "Today's Pet Taxi"}
          </h3>
          <div className="space-y-2">
            {todayBoardingTaxisList.map((t) => {
              const dirLabel = t.direction === 'GO'
                ? (isFr ? 'Aller' : 'Go')
                : (isFr ? 'Retour' : 'Return');
              const timeLabel = t.time ?? (isFr ? 'À confirmer' : 'TBD');
              return (
                <div key={`${t.bookingId}-${t.direction}`} className="flex items-center gap-1.5 text-sm flex-wrap">
                  <span className="font-medium text-charcoal">{t.clientName}</span>
                  <span className="text-charcoal/30">—</span>
                  <span className="text-charcoal/70">{t.pets}</span>
                  <span className="text-charcoal/30">—</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 text-xs font-medium">
                    🚗 {dirLabel}
                  </span>
                  <span className="text-charcoal/30">—</span>
                  <span className={t.time ? 'text-charcoal font-medium' : 'text-charcoal/40 italic text-xs'}>
                    {timeLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
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
          {l.pension}
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'BOARDING' ? 'bg-white/20 text-white' : 'bg-ivory-100 text-charcoal/50'}`}>
            {bookings.filter((b) => b.serviceType === 'BOARDING' && b.status !== 'COMPLETED').length}
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
          {l.petTaxi}
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'PET_TAXI' ? 'bg-white/20 text-white' : 'bg-ivory-100 text-charcoal/50'}`}>
            {taxiTabCount}
          </span>
        </button>
      </div>

      {/* BOARDING Kanban */}
      {tab === 'BOARDING' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
            <Column
              title={l.colPending}
              count={pending.length}
              cards={pending}
              locale={locale}
              color="bg-amber-50 border-amber-100"
              dotColor="bg-amber-400"
            />
            <Column
              title={l.colConfirmed}
              count={confirmed.length}
              cards={confirmed}
              locale={locale}
              color="bg-blue-50 border-blue-100"
              dotColor="bg-blue-400"
            />
            <Column
              title={l.colInProgress}
              count={inProgress.length}
              cards={inProgress}
              locale={locale}
              color="bg-green-50 border-green-100"
              dotColor="bg-green-400"
            />
            <Column
              title={l.colCompleted}
              count={completed.length}
              cards={completed}
              locale={locale}
              color="bg-gray-50 border-gray-100"
              dotColor="bg-gray-300"
            />
          </div>
        </div>
      )}

      {/* PET TAXI — Aller + Retour */}
      {tab === 'PET_TAXI' && (
        <div className="space-y-6">
          {/* Section Aller (OUTBOUND + STANDALONE) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-sm font-semibold">
                <ArrowRight className="h-3.5 w-3.5" />
                {isFr ? 'Aller' : 'Outbound'}
              </span>
              <span className="text-xs text-gray-400">{allerCards.length} trajet{allerCards.length > 1 ? 's' : ''}</span>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
                {ALLER_COLS.map((col) => (
                  <TaxiKanbanColumn
                    key={col.status}
                    col={col}
                    cards={allerCards.filter((c) => c._colStatus === col.status)}
                    locale={locale}
                    onStatusChange={handleTaxiStatusChange}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-dashed border-gray-200" />

          {/* Section Retour (RETURN) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-sm font-semibold">
                <ArrowLeft className="h-3.5 w-3.5" />
                {isFr ? 'Retour' : 'Return'}
              </span>
              <span className="text-xs text-gray-400">{retourCards.length} trajet{retourCards.length > 1 ? 's' : ''}</span>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
                {RETOUR_COLS.map((col) => (
                  <TaxiKanbanColumn
                    key={col.status}
                    col={col}
                    cards={retourCards.filter((c) => c._colStatus === col.status)}
                    locale={locale}
                    onStatusChange={handleTaxiStatusChange}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
