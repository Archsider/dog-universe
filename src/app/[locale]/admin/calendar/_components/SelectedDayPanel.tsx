import { Car, PawPrint, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type CalendarBooking,
  type TaxiDayEntry,
  STATUS_CHIP,
} from '../_lib/calendar-helpers';

interface Props {
  isEn: boolean;
  locale: string;
  selectedDay: number;
  monthName: string;
  year: number;
  bookings: CalendarBooking[];
  taxis: TaxiDayEntry[];
  departureIds: Set<string> | undefined;
  arrivalIds: Set<string> | undefined;
  statusLabels: Record<string, string>;
  onClose: () => void;
}

/**
 * Side panel surfaced when a day is clicked. Layout:
 *   1. Header — date + close (X) button
 *   2. Bookings list — sorted (arrivals → ongoing → departures), each
 *      booking is a click-through link to /admin/reservations/{id}.
 *      Cards have arrival-green / departure-purple / ongoing-neutral tints.
 *   3. Transports section — orange pills for go/return taxi addons
 *
 * Empty state when no bookings and no taxis.
 */
export function SelectedDayPanel({
  isEn,
  locale,
  selectedDay,
  monthName,
  year,
  bookings,
  taxis,
  departureIds,
  arrivalIds,
  statusLabels,
  onClose,
}: Props) {
  const formatShort = (iso: string) =>
    new Intl.DateTimeFormat(isEn ? 'en-US' : 'fr-FR', {
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso));

  // Sort: arrivals first, then ongoing, then departures.
  const tagged = bookings.map((b) => ({
    b,
    isArrival: arrivalIds?.has(b.id) ?? false,
    isDeparture: departureIds?.has(b.id) ?? false,
  }));
  const sorted = [
    ...tagged.filter((t) => t.isArrival && !t.isDeparture),
    ...tagged.filter((t) => !t.isArrival && !t.isDeparture),
    ...tagged.filter((t) => t.isDeparture),
  ];

  return (
    <div className="xl:w-80 bg-white rounded-2xl border border-ivory-200 shadow-sm overflow-hidden self-start xl:sticky xl:top-24">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ivory-100">
        <h3 className="font-serif font-bold text-charcoal">
          {selectedDay} {monthName} {year}
        </h3>
        <button
          onClick={onClose}
          className="text-charcoal/40 hover:text-charcoal transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {bookings.length === 0 && taxis.length === 0 ? (
          <p className="text-sm text-charcoal/40 text-center py-6">
            {isEn ? 'No bookings this day' : 'Aucune réservation ce jour'}
          </p>
        ) : (
          <>
            {sorted.length > 0 && (
              <div className="space-y-3">
                {sorted.map(({ b, isArrival, isDeparture }) => (
                  <a
                    key={b.id}
                    href={`/${locale}/admin/reservations/${b.id}`}
                    className={cn(
                      'block p-3 rounded-xl border transition-colors group',
                      isDeparture
                        ? 'border-purple-200 bg-purple-50/40 hover:border-purple-400 hover:bg-purple-50'
                        : isArrival
                          ? 'border-green-200 bg-green-50/40 hover:border-green-400 hover:bg-green-50'
                          : 'border-ivory-200 hover:border-gold-300 hover:bg-ivory-50',
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5 gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {b.serviceType === 'PET_TAXI' ? (
                          <Car className="h-3.5 w-3.5 text-charcoal/40 flex-shrink-0" />
                        ) : (
                          <PawPrint className="h-3.5 w-3.5 text-charcoal/40 flex-shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-charcoal truncate">
                          {b.serviceType === 'BOARDING'
                            ? isEn
                              ? 'Boarding'
                              : 'Pension'
                            : 'Taxi'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isDeparture && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-purple-100 border-purple-300 text-purple-700 font-semibold">
                            ↩ {isEn ? 'Departure' : 'Départ'}
                          </span>
                        )}
                        {isArrival && !isDeparture && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-100 border-green-300 text-green-700 font-semibold">
                            → {isEn ? 'Arrival' : 'Arrivée'}
                          </span>
                        )}
                        {!isDeparture && !isArrival && (
                          <span
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded border',
                              STATUS_CHIP[b.status] ??
                                'bg-gray-100 border-gray-200 text-gray-600',
                            )}
                          >
                            {statusLabels[b.status] ?? b.status}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-charcoal/50 mb-0.5">{b.client.name}</p>
                    <p className="text-xs font-medium text-charcoal group-hover:text-gold-700 transition-colors">
                      {b.bookingPets.map((bp) => bp.pet.name).join(', ')}
                    </p>
                    <div className="flex items-center justify-between mt-0.5">
                      {b.bookingPets.length > 0 && (
                        <p className="text-[10px] text-charcoal/40">
                          {b.bookingPets
                            .map((bp) => (bp.pet.species === 'DOG' ? '🐶' : '🐱'))
                            .join(' ')}
                        </p>
                      )}
                      {b.serviceType === 'BOARDING' && b.endDate && (
                        <p className="text-[10px] text-charcoal/35 ml-auto">
                          {formatShort(b.startDate)} → {formatShort(b.endDate)}
                        </p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}

            {taxis.length > 0 && (
              <div>
                {sorted.length > 0 && (
                  <div className="border-t border-ivory-100 pt-3 mb-3" />
                )}
                <p className="text-[10px] font-semibold text-charcoal/40 uppercase tracking-wide mb-2">
                  {isEn ? 'Transports' : 'Transports'}
                </p>
                <div className="space-y-2">
                  {taxis.map((t) => {
                    const dir =
                      t.direction === 'aller'
                        ? isEn
                          ? 'Go'
                          : 'Aller'
                        : isEn
                          ? 'Return'
                          : 'Retour';
                    const timeLabel = t.time ?? (isEn ? 'TBD' : 'À confirmer');
                    return (
                      <div
                        key={`${t.bookingId}-${t.direction}`}
                        className="flex items-start gap-2 p-2.5 rounded-lg bg-orange-50 border border-orange-100"
                      >
                        <span className="text-base leading-none mt-0.5">🚗</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-orange-800">
                            {dir}
                            {t.time && (
                              <span className="ml-1 font-normal text-orange-700">
                                · {t.time}
                              </span>
                            )}
                            {!t.time && (
                              <span className="ml-1 font-normal italic text-orange-500">
                                · {timeLabel}
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-orange-700/70 truncate">
                            {t.clientName} — {t.pets}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
