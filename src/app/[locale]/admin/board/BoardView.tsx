'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  PawPrint, Car, Home, ArrowRight, ArrowLeft,
  Clock, CheckCircle2, Loader2, Trophy, Scissors,
} from 'lucide-react';
import { formatMAD } from '@/lib/utils';

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
  hasTaxiAddon: boolean;
  updatedAt: string;
}

interface Stats {
  activeBoarders: number;
  dogCount: number;
  catCount: number;
  todayArrivals: number;
  todayDepartures: number;
  todayTaxis: number;
  todayArrivalDetails: { id: string; clientName: string; pets: string; arrivalTime: string | null }[];
  todayDepartureDetails: { id: string; clientName: string; pets: string }[];
  todayTaxiDetails: { id: string; clientName: string; pets: string; arrivalTime: string | null; taxiType: string }[];
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
        {b.hasTaxiAddon && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
            <Car className="h-2.5 w-2.5" />
            Taxi
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

export default function BoardView({ locale, bookings, stats }: Props) {
  const [tab, setTab] = useState<'BOARDING' | 'PET_TAXI'>('BOARDING');
  const isFr = locale === 'fr';

  const { pending, confirmed, inProgress, completed } = categorize(bookings, tab);

  const l = {
    title: isFr ? 'Tableau opérationnel' : 'Operations Board',
    subtitle: isFr ? 'Vue en temps réel des séjours et trajets' : 'Real-time view of stays and rides',
    activeBoarders: isFr ? 'Pensionnaires actifs' : 'Active boarders',
    arrivals: isFr ? 'Arrivées aujourd\'hui' : 'Today\'s arrivals',
    departures: isFr ? 'Départs aujourd\'hui' : 'Today\'s departures',
    taxis: isFr ? 'Taxis aujourd\'hui' : 'Today\'s taxis',
    pension: isFr ? 'Pension' : 'Boarding',
    petTaxi: 'Pet Taxi',
    colPending: isFr ? 'En attente' : 'Pending',
    colConfirmed: isFr ? 'Confirmé' : 'Confirmed',
    colInProgress: isFr ? 'En cours' : 'In progress',
    colCompleted: isFr ? 'Terminé (7j)' : 'Completed (7d)',
    at: isFr ? 'à' : 'at',
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
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Car className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-serif font-bold text-charcoal">{stats.todayTaxis}</p>
              <p className="text-xs text-charcoal/50">{l.taxis}</p>
            </div>
          </div>
          {stats.todayTaxiDetails.length > 0 && (
            <ul className="mt-2 space-y-0.5 pl-12">
              {stats.todayTaxiDetails.slice(0, 3).map((d) => (
                <li key={d.id} className="text-xs text-gray-500 truncate">
                  {d.clientName}
                  {d.arrivalTime && <span className="text-gray-400"> {l.at} {d.arrivalTime}</span>}
                </li>
              ))}
              {stats.todayTaxiDetails.length > 3 && (
                <li className="text-xs text-gray-400">+{stats.todayTaxiDetails.length - 3} autres</li>
              )}
            </ul>
          )}
        </div>
      </div>

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
            {bookings.filter((b) => b.serviceType === 'PET_TAXI' && b.status !== 'COMPLETED').length}
          </span>
        </button>
      </div>

      {/* Kanban */}
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
    </div>
  );
}
