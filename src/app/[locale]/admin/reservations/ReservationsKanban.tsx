'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Package, Car, MapPin, Clock, CalendarDays, ChevronRight } from 'lucide-react';

export interface KanbanBooking {
  id: string;
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
  { status: 'PENDING',     label: { fr: 'Demande reçue',          en: 'Request received' },    color: 'bg-amber-50  border-amber-200',  dot: 'bg-amber-400' },
  { status: 'CONFIRMED',   label: { fr: 'Séjour confirmé',         en: 'Stay confirmed' },      color: 'bg-blue-50   border-blue-200',   dot: 'bg-blue-400' },
  { status: 'IN_PROGRESS', label: { fr: 'Dans nos murs',           en: 'Currently staying' },   color: 'bg-green-50  border-green-200',  dot: 'bg-green-400' },
  { status: 'COMPLETED',   label: { fr: 'Séjour terminé',          en: 'Stay completed' },      color: 'bg-gray-50   border-gray-200',   dot: 'bg-gray-400' },
];

const TAXI_COLS = [
  { status: 'PENDING',     label: { fr: 'Transport planifié',      en: 'Transport planned' },   color: 'bg-amber-50  border-amber-200',  dot: 'bg-amber-400' },
  { status: 'CONFIRMED',   label: { fr: 'Chauffeur en route',      en: 'Driver en route' },     color: 'bg-blue-50   border-blue-200',   dot: 'bg-blue-400' },
  { status: 'IN_PROGRESS', label: { fr: 'Animal à bord',           en: 'Pet on board' },        color: 'bg-green-50  border-green-200',  dot: 'bg-green-400' },
  { status: 'COMPLETED',   label: { fr: 'Arrivé à destination',    en: 'Arrived' },             color: 'bg-gray-50   border-gray-200',   dot: 'bg-gray-400' },
];

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

function BoardingCard({ b, locale }: { b: KanbanBooking; locale: string }) {
  return (
    <Link href={`/${locale}/admin/reservations/${b.id}`}>
      <div className="bg-white border border-ivory-200 rounded-xl p-3 shadow-sm hover:border-gold-300 hover:shadow-md transition-all group">
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
      </div>
    </Link>
  );
}

function TaxiCard({ b, locale }: { b: KanbanBooking; locale: string }) {
  const { departure, arrival } = parseAddresses(b.notes);
  return (
    <Link href={`/${locale}/admin/reservations/${b.id}`}>
      <div className="bg-white border border-ivory-200 rounded-xl p-3 shadow-sm hover:border-blue-300 hover:shadow-md transition-all group">
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
      </div>
    </Link>
  );
}

function Column({
  col,
  bookings,
  locale,
  pipeline,
}: {
  col: { status: string; label: { fr: string; en: string }; color: string; dot: string };
  bookings: KanbanBooking[];
  locale: string;
  pipeline: 'BOARDING' | 'PET_TAXI';
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
              <BoardingCard key={b.id} b={b} locale={locale} />
            ) : (
              <TaxiCard key={b.id} b={b} locale={locale} />
            )
          )
        )}
      </div>
    </div>
  );
}

export function ReservationsKanban({ bookings, locale }: Props) {
  const [pipeline, setPipeline] = useState<'BOARDING' | 'PET_TAXI'>('BOARDING');
  const isFr = locale === 'fr';

  const cols = pipeline === 'BOARDING' ? BOARDING_COLS : TAXI_COLS;
  const filtered = bookings.filter((b) => b.serviceType === pipeline);

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
          />
        ))}
      </div>
    </div>
  );
}
