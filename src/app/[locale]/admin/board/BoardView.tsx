'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PawPrint, Car, Home, ArrowRight, ArrowLeft, Scissors, Loader2, MapPin, Clock,
  CalendarCheck, CheckCheck, Calendar, Inbox,
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
  pets: { name: string; species: string; photoUrl: string | null }[];
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

// Mapping statut → bouton d'action BOARDING
const BOARDING_NEXT: Record<string, { next: string; labelFr: string; labelEn: string }> = {
  PENDING:     { next: 'CONFIRMED',   labelFr: '✅ Confirmer',       labelEn: '✅ Confirm' },
  CONFIRMED:   { next: 'IN_PROGRESS', labelFr: '🏠 Marquer arrivée', labelEn: '🏠 Mark arrival' },
  IN_PROGRESS: { next: 'COMPLETED',   labelFr: '✅ Terminer séjour', labelEn: '✅ End stay' },
};

function KanbanCard({ b, locale, href }: { b: BookingCard; locale: string; href: string }) {
  const isFr = locale === 'fr';
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const nights = nightCount(b.startDate, b.endDate);
  const petLine = b.pets.map((p) => p.name).join(' · ');
  const firstPet = b.pets[0];
  const extraCount = Math.max(0, b.pets.length - 1);
  const hasTaxi = b.taxiGoEnabled || b.taxiReturnEnabled;
  const taxiBadgeLabel = b.taxiGoEnabled && b.taxiReturnEnabled
    ? (isFr ? 'Aller + Retour' : 'Go + Return')
    : b.taxiGoEnabled
    ? (isFr ? 'Aller' : 'Go')
    : (isFr ? 'Retour' : 'Return');
  const isCompleted = b.status === 'COMPLETED';
  const action = BOARDING_NEXT[b.status];

  const handleAction = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!action || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action.next }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: isFr ? 'Statut mis à jour' : 'Status updated', variant: 'success' });
      router.refresh();
    } catch {
      toast({ title: isFr ? 'Erreur' : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-white border border-[rgba(196,151,74,0.12)] rounded-xl p-2 sm:p-3 lg:p-4 transition-all hover:shadow-[0_4px_12px_rgba(42,37,32,0.05)] hover:-translate-y-px ${isCompleted ? 'opacity-60' : ''}`}>
      <Link href={href} className="block">
        {/* Header: photo + client + pets */}
        <div className="flex items-start gap-2 sm:gap-3 lg:gap-4">
          <div className="relative w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-[10px] overflow-hidden bg-[#F5E6CC] flex items-center justify-center flex-shrink-0">
            {firstPet?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firstPet.photoUrl} alt={firstPet.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] sm:text-xs font-bold text-[#8B6A2F]">{getInitials(b.clientName)}</span>
            )}
            {extraCount > 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#C4974A] text-white text-[9px] font-bold leading-none">
                +{extraCount}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm lg:text-base font-bold text-[#2A2520] truncate leading-tight">{b.clientName}</p>
            <p className="text-[8px] sm:text-[9px] lg:text-[10px] text-[#8B6A2F] mt-1 flex items-center gap-1 truncate">
              <PawPrint className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{petLine}</span>
            </p>
          </div>
        </div>

        {/* Meta */}
        <div className="mt-2 sm:mt-2.5 flex items-center gap-2 sm:gap-3 text-[7px] sm:text-[8px] lg:text-[9px] text-[#8A7E75]">
          <span className="inline-flex items-center gap-1 truncate">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">
              {formatDateShortLocal(b.startDate, locale)}
              {b.serviceType === 'BOARDING' && b.endDate && ` → ${formatDateShortLocal(b.endDate, locale)}`}
            </span>
          </span>
          {b.serviceType === 'BOARDING' && nights > 0 && (
            <span className="inline-flex items-center gap-1 flex-shrink-0">
              <Clock className="h-3 w-3" />
              {nights} {isFr ? `nuit${nights > 1 ? 's' : ''}` : `night${nights > 1 ? 's' : ''}`}
            </span>
          )}
          {b.serviceType === 'PET_TAXI' && b.arrivalTime && (
            <span className="inline-flex items-center gap-1 flex-shrink-0">
              <Clock className="h-3 w-3" />
              {b.arrivalTime}
            </span>
          )}
        </div>

        {/* Footer: badges + price */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {b.includeGrooming && (
            <span className="inline-flex items-center gap-0.5 text-[6px] sm:text-[7px] lg:text-[8px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
              <Scissors className="h-2.5 w-2.5" />
              {isFr ? 'Toilettage' : 'Grooming'}
            </span>
          )}
          {hasTaxi && (
            <span className="inline-flex items-center gap-1 text-[6px] sm:text-[7px] lg:text-[8px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">
              <Car className="h-2.5 w-2.5" />
              {taxiBadgeLabel}
            </span>
          )}
          {b.taxiType && (
            <span className="text-[6px] sm:text-[7px] lg:text-[8px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
              {TAXI_LABELS[b.taxiType]?.[locale] ?? b.taxiType}
            </span>
          )}
          <span className="ml-auto text-xs sm:text-sm lg:text-base font-bold text-[#C4974A]">{formatMAD(b.totalPrice)}</span>
        </div>
      </Link>

      {/* Bouton transition statut BOARDING */}
      {action && (
        <button
          type="button"
          onClick={handleAction}
          disabled={loading}
          className="w-full mt-2 py-2 flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium bg-white border border-[#C4974A] text-[#C4974A] hover:bg-[#C4974A] hover:text-white transition-all duration-200 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          <span className="truncate">{isFr ? action.labelFr : action.labelEn}</span>
        </button>
      )}
    </div>
  );
}

interface ColumnProps {
  col: typeof PENSION_KANBAN_COLS[number];
  cards: BookingCard[];
  locale: string;
}

function Column({ col, cards, locale }: ColumnProps) {
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
            <span className="text-[7px] sm:text-[8px] lg:text-[9px]">{locale === 'fr' ? 'Aucune réservation' : 'No bookings'}</span>
          </div>
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

// ─── PENSION Kanban config ─────────────────────────────────────────────────

type PensionColKey = 'pending' | 'confirmed' | 'inProgress' | 'completed';

const PENSION_KANBAN_COLS: {
  key: PensionColKey;
  label: { fr: string; en: string };
  sublabel: { fr: string; en: string };
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  dot: string;
}[] = [
  {
    key: 'pending',
    label:    { fr: 'En attente',                en: 'Pending' },
    sublabel: { fr: 'Réservations à confirmer',  en: 'Awaiting confirmation' },
    icon: Clock,
    color: 'bg-amber-50 border-amber-100',
    dot:   'bg-amber-400',
  },
  {
    key: 'confirmed',
    label:    { fr: 'Confirmé',          en: 'Confirmed' },
    sublabel: { fr: 'Séjours confirmés', en: 'Confirmed stays' },
    icon: CalendarCheck,
    color: 'bg-blue-50 border-blue-100',
    dot:   'bg-blue-400',
  },
  {
    key: 'inProgress',
    label:    { fr: 'En cours',                  en: 'In progress' },
    sublabel: { fr: 'Actuellement en pension',   en: 'Currently boarding' },
    icon: Home,
    color: 'bg-green-50 border-green-100',
    dot:   'bg-green-400',
  },
  {
    key: 'completed',
    label:    { fr: 'Terminé (7j)',      en: 'Completed (7d)' },
    sublabel: { fr: 'Séjours terminés',  en: 'Finished stays' },
    icon: CheckCheck,
    color: 'bg-gray-50 border-gray-100',
    dot:   'bg-gray-300',
  },
];

// ─── PET TAXI Kanban ───────────────────────────────────────────────────────

type TaxiColConfig = {
  status: string;
  label: { fr: string; en: string };
  sublabel: { fr: string; en: string };
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  dot: string;
};

// ALLER = OUTBOUND + STANDALONE
const ALLER_COLS: TaxiColConfig[] = [
  {
    status: 'PLANNED',
    label:    { fr: 'Planifié',        en: 'Planned' },
    sublabel: { fr: 'Trajets à venir', en: 'Upcoming rides' },
    icon: Clock,
    color: 'bg-amber-50 border-amber-200',
    dot:   'bg-amber-400',
  },
  {
    status: 'EN_ROUTE_TO_CLIENT',
    label:    { fr: 'En route',             en: 'En route' },
    sublabel: { fr: 'Véhicule en approche', en: 'Vehicle approaching' },
    icon: Car,
    color: 'bg-sky-50 border-sky-200',
    dot:   'bg-sky-500',
  },
  {
    status: 'ON_SITE_CLIENT',
    label:    { fr: 'Arrivé chez le client', en: 'On site' },
    sublabel: { fr: 'Chez le client',        en: 'At client location' },
    icon: MapPin,
    color: 'bg-teal-50 border-teal-200',
    dot:   'bg-teal-500',
  },
  {
    status: 'ANIMAL_ON_BOARD',
    label:    { fr: 'Animal à bord',  en: 'Pet on board' },
    sublabel: { fr: 'Trajet en cours', en: 'Ride in progress' },
    icon: PawPrint,
    color: 'bg-cyan-50 border-cyan-200',
    dot:   'bg-cyan-600',
  },
  {
    status: 'ARRIVED_AT_PENSION',
    label:    { fr: 'Arrivé en pension',  en: 'At pension' },
    sublabel: { fr: 'Déposé avec succès', en: 'Successfully dropped off' },
    icon: Home,
    color: 'bg-green-50 border-green-200',
    dot:   'bg-green-500',
  },
];

// RETOUR = RETURN uniquement
const RETOUR_COLS: TaxiColConfig[] = [
  {
    status: 'PLANNED',
    label:    { fr: 'Planifié',        en: 'Planned' },
    sublabel: { fr: 'Retours à venir', en: 'Upcoming returns' },
    icon: Clock,
    color: 'bg-amber-50 border-amber-200',
    dot:   'bg-amber-400',
  },
  {
    status: 'ANIMAL_ON_BOARD',
    label:    { fr: 'Animal à bord',        en: 'Pet on board' },
    sublabel: { fr: 'Départ de la pension', en: 'Departing pension' },
    icon: PawPrint,
    color: 'bg-orange-50 border-orange-200',
    dot:   'bg-orange-500',
  },
  {
    status: 'EN_ROUTE_TO_CLIENT',
    label:    { fr: 'En route',               en: 'En route' },
    sublabel: { fr: 'Trajet retour en cours', en: 'Return ride in progress' },
    icon: Car,
    color: 'bg-amber-100 border-amber-300',
    dot:   'bg-amber-600',
  },
  {
    status: 'ARRIVED_AT_CLIENT',
    label:    { fr: 'Rendu au client', en: 'At client' },
    sublabel: { fr: 'Retour terminé',  en: 'Return completed' },
    icon: Home,
    color: 'bg-green-50 border-green-200',
    dot:   'bg-green-500',
  },
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
  PLANNED:            { fr: 'En route',               en: 'En route' },
  EN_ROUTE_TO_CLIENT: { fr: 'Arrivé chez le client',  en: 'Arrived at client' },
  ON_SITE_CLIENT:     { fr: 'Animal à bord',          en: 'Pet on board' },
  ANIMAL_ON_BOARD:    { fr: 'Arrivé en pension',      en: 'At pension' },
};

const RETOUR_ACTION_LABELS: Record<string, { fr: string; en: string }> = {
  PLANNED:            { fr: 'Animal à bord',  en: 'Pet on board' },
  ANIMAL_ON_BOARD:    { fr: 'En route',       en: 'En route' },
  EN_ROUTE_TO_CLIENT: { fr: 'Rendu au client', en: 'At client' },
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

// Étapes courtes affichées sous chaque rond du stepper taxi
const TAXI_STEP_SHORT: Record<string, { fr: string; en: string }> = {
  PLANNED:            { fr: 'Plan.',  en: 'Plan.' },
  EN_ROUTE_TO_CLIENT: { fr: 'Route',  en: 'Route' },
  ON_SITE_CLIENT:     { fr: 'Client', en: 'Client' },
  ANIMAL_ON_BOARD:    { fr: 'Bord',   en: 'Aboard' },
  ARRIVED_AT_PENSION: { fr: 'Pens.',  en: 'Pens.' },
  ARRIVED_AT_CLIENT:  { fr: 'Rendu',  en: 'Done' },
};

const ALLER_FLOW = ['PLANNED', 'EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD', 'ARRIVED_AT_PENSION'];
const RETOUR_FLOW = ['PLANNED', 'ANIMAL_ON_BOARD', 'EN_ROUTE_TO_CLIENT', 'ARRIVED_AT_CLIENT'];

function TaxiStepper({
  flow,
  currentStatus,
  locale,
}: {
  flow: string[];
  currentStatus: string;
  locale: string;
}) {
  const isFr = locale === 'fr';
  const currentIdx = Math.max(0, flow.indexOf(currentStatus));
  return (
    <div className="mt-2 flex items-stretch">
      {flow.map((step, i) => {
        const isActive = i <= currentIdx;
        const isFirst = i === 0;
        const isLast = i === flow.length - 1;
        const short = TAXI_STEP_SHORT[step];
        const label = short ? (isFr ? short.fr : short.en) : '';
        // Connecteurs : rendus systématiquement pour symétrie ; transparents aux extrémités.
        const leftConnectorClass = isFirst
          ? 'bg-transparent'
          : i <= currentIdx
            ? 'bg-[#C4974A]'
            : 'bg-[rgba(196,151,74,0.2)]';
        const rightConnectorClass = isLast
          ? 'bg-transparent'
          : i < currentIdx
            ? 'bg-[#C4974A]'
            : 'bg-[rgba(196,151,74,0.2)]';
        return (
          <div key={step} className="flex-1 flex flex-col items-center min-w-0">
            <div className="flex items-center justify-center w-full">
              <div className={`h-[2px] flex-1 mx-1 ${leftConnectorClass}`} />
              <div
                className={`flex items-center justify-center mx-auto rounded-full border-2 text-[10px] flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 transition-colors ${
                  isActive
                    ? 'bg-[#C4974A] border-[#C4974A] text-white font-bold'
                    : 'bg-white border-[rgba(196,151,74,0.35)] text-[#8A7E75]'
                }`}
              >
                {i + 1}
              </div>
              <div className={`h-[2px] flex-1 mx-1 ${rightConnectorClass}`} />
            </div>
            <span className="block w-full text-center text-[10px] mt-1 truncate text-[#8A7E75]">{label}</span>
          </div>
        );
      })}
    </div>
  );
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
  const flow = isRetour ? RETOUR_FLOW : ALLER_FLOW;
  const nextStatus = (isRetour ? RETOUR_NEXT : ALLER_NEXT)[b._colStatus];
  const actionLabel = nextStatus ? (isRetour ? RETOUR_ACTION_LABELS : ALLER_ACTION_LABELS)[b._colStatus] : null;
  const { departure, arrival } = parseAddresses(b.notes);
  const petLine = b.pets.map((p) => p.name).join(' · ');
  const firstPet = b.pets[0];
  const extraCount = Math.max(0, b.pets.length - 1);
  const isTerminal = b._colStatus === 'ARRIVED_AT_PENSION' || b._colStatus === 'ARRIVED_AT_CLIENT';
  const taxiDate = b._cardType === 'GO'
    ? (b.taxiGoDate ?? b.startDate)
    : b._cardType === 'RETURN'
    ? (b.taxiReturnDate ?? b.startDate)
    : b.startDate;
  const taxiTime = b._cardType === 'GO' ? b.taxiGoTime : b._cardType === 'RETURN' ? b.taxiReturnTime : b.arrivalTime;

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
    <div className={`bg-white border border-[rgba(196,151,74,0.12)] rounded-xl p-2 sm:p-3 lg:p-4 transition-all hover:shadow-[0_4px_12px_rgba(42,37,32,0.05)] hover:-translate-y-px ${isTerminal ? 'opacity-60' : ''}`}>
      <Link href={`/${locale}/admin/reservations/${b.id}`} className="block">
        {/* Header: photo + client + pets */}
        <div className="flex items-start gap-2 sm:gap-3 lg:gap-4">
          <div className="relative w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-[10px] overflow-hidden bg-[#F5E6CC] flex items-center justify-center flex-shrink-0">
            {firstPet?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firstPet.photoUrl} alt={firstPet.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] sm:text-xs font-bold text-[#8B6A2F]">{getInitials(b.clientName)}</span>
            )}
            {extraCount > 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#C4974A] text-white text-[9px] font-bold leading-none">
                +{extraCount}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm lg:text-base font-bold text-[#2A2520] truncate leading-tight">{b.clientName}</p>
            <p className="text-[8px] sm:text-[9px] lg:text-[10px] text-[#8B6A2F] mt-1 flex items-center gap-1 truncate">
              <PawPrint className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{petLine}</span>
            </p>
          </div>
        </div>

        {/* Addresses */}
        {(departure || arrival) && (
          <div className="mt-2 space-y-0.5">
            {departure && (
              <div className="flex items-start gap-1 text-[7px] sm:text-[8px] lg:text-[9px] text-[#8A7E75]">
                <MapPin className="h-3 w-3 flex-shrink-0 text-green-500 mt-px" />
                <span className="truncate">{departure}</span>
              </div>
            )}
            {arrival && (
              <div className="flex items-start gap-1 text-[7px] sm:text-[8px] lg:text-[9px] text-[#8A7E75]">
                <MapPin className="h-3 w-3 flex-shrink-0 text-red-400 mt-px" />
                <span className="truncate">{arrival}</span>
              </div>
            )}
          </div>
        )}

        {/* Meta */}
        <div className="mt-2 flex items-center gap-2 sm:gap-3 text-[7px] sm:text-[8px] lg:text-[9px] text-[#8A7E75]">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            {formatDateShortLocal(taxiDate, locale)}
          </span>
          {taxiTime && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {taxiTime}
            </span>
          )}
        </div>

        {/* Badges */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {b.taxiType && (
            <span className="text-[6px] sm:text-[7px] lg:text-[8px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
              {TAXI_LABELS[b.taxiType]?.[locale] ?? b.taxiType}
            </span>
          )}
          {b._cardType && (
            <span className="inline-flex items-center gap-1 text-[6px] sm:text-[7px] lg:text-[8px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">
              <Car className="h-2.5 w-2.5" />
              {b._cardType === 'GO' ? (isFr ? 'Aller' : 'Go') : (isFr ? 'Retour' : 'Return')}
            </span>
          )}
        </div>

        {/* Stepper progression — ronds */}
        <TaxiStepper flow={flow} currentStatus={b._colStatus} locale={locale} />
      </Link>
      {actionLabel && (
        <button
          onClick={handleAction}
          disabled={loading}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] sm:text-xs lg:text-sm font-semibold bg-[#FEFCF9] text-[#C4974A] border border-[#C4974A]/50 hover:bg-[#C4974A] hover:text-white hover:border-[#C4974A] transition-all disabled:opacity-50"
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
  col: TaxiColConfig;
  cards: TaxiCard[];
  locale: string;
  onStatusChange: (id: string, newStatus: string, field?: 'taxiGoStatus' | 'taxiReturnStatus') => void;
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
            <Column col={PENSION_KANBAN_COLS[0]} cards={pending}    locale={locale} />
            <Column col={PENSION_KANBAN_COLS[1]} cards={confirmed}  locale={locale} />
            <Column col={PENSION_KANBAN_COLS[2]} cards={inProgress} locale={locale} />
            <Column col={PENSION_KANBAN_COLS[3]} cards={completed}  locale={locale} />
        </div>
      )}

      {/* PET TAXI — Aller + Retour */}
      {tab === 'PET_TAXI' && (
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
                  onStatusChange={handleTaxiStatusChange}
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
                  onStatusChange={handleTaxiStatusChange}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
