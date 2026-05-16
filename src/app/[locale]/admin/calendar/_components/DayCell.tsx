import { Car, PawPrint } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type CalendarBooking, type TaxiDayEntry, STATUS_CHIP } from '../_lib/calendar-helpers';

interface Props {
  day: number;
  isToday: boolean;
  isSelected: boolean;
  isEn: boolean;
  bookings: CalendarBooking[];
  taxis: TaxiDayEntry[];
  departureIds: Set<string> | undefined;
  arrivalIds: Set<string> | undefined;
  onClick: () => void;
}

/**
 * Single day cell of the calendar grid. Shows:
 *   - day number (gold pill if today)
 *   - up to 2 booking chips, with an arrival/departure indicator
 *   - a "+N more" overflow row
 *   - taxi-addon indicators (orange car chips) for boarding bookings
 *     with go/return taxi enabled
 *
 * Background tints change for "has bookings" / "selected" so the operator
 * can spot busy days at a glance.
 */
export function DayCell({
  day,
  isToday,
  isSelected,
  isEn,
  bookings,
  taxis,
  departureIds,
  arrivalIds,
  onClick,
}: Props) {
  const hasBoardings = bookings.length > 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        'min-h-[88px] border-b border-r border-ivory-100 p-1.5 cursor-pointer transition-colors select-none',
        isSelected
          ? 'bg-gold-50 ring-1 ring-inset ring-gold-300'
          : hasBoardings
            ? 'bg-[#FDF8F0] hover:bg-[#FAF4E8]'
            : 'hover:bg-ivory-50',
      )}
    >
      <div
        className={cn(
          'w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1.5',
          isToday ? 'bg-gold-500 text-white' : 'text-charcoal/70',
        )}
      >
        {day}
      </div>

      <div className="space-y-0.5">
        {bookings.slice(0, 2).map((b) => {
          const petName = b.bookingPets[0]?.pet.name ?? '?';
          const extra =
            b.bookingPets.length > 1 ? ` +${b.bookingPets.length - 1}` : '';
          const isDeparture = departureIds?.has(b.id) ?? false;
          const isArrival = arrivalIds?.has(b.id) ?? false;
          const title = isDeparture
            ? isEn
              ? 'Departure day'
              : 'Jour de départ'
            : isArrival
              ? isEn
                ? 'Arrival day'
                : "Jour d'arrivée"
              : undefined;
          // Walk-in fantôme bookings get their own purple chip — they
          // represent a paid-on-the-spot transaction, not a stay. Marker
          // overrides the STATUS_CHIP color so the operator distinguishes
          // them at a glance from real boardings.
          const isWalkInChip = b.isWalkIn === true || b.source === 'WALKIN';
          const chipClass = isWalkInChip
            ? 'bg-purple-100 text-purple-800 border-purple-200'
            : (STATUS_CHIP[b.status] ?? 'bg-gray-100 text-gray-600 border-gray-200');
          const walkInTitle = isWalkInChip
            ? (isEn ? 'Walk-in invoice' : 'Facture walk-in')
            : title;
          return (
            <div
              key={b.id}
              className={cn(
                'text-[10px] leading-tight px-1.5 py-0.5 rounded border flex items-center gap-1 overflow-hidden',
                chipClass,
                isDeparture && !isWalkInChip && 'border-dashed',
              )}
              title={walkInTitle}
            >
              {isArrival && !isWalkInChip && <span className="text-[9px] flex-shrink-0">→</span>}
              {isWalkInChip ? (
                <span className="text-[9px] flex-shrink-0" aria-hidden="true">🛒</span>
              ) : b.serviceType === 'PET_TAXI' ? (
                <Car className="h-2.5 w-2.5 flex-shrink-0" />
              ) : (
                <PawPrint className="h-2.5 w-2.5 flex-shrink-0" />
              )}
              <span className="truncate font-medium">
                {isWalkInChip
                  ? (isEn ? 'Walk-in' : 'Walk-in')
                  : `${petName}${extra}`}
              </span>
              {isDeparture && !isWalkInChip && (
                <span className="ml-auto text-[9px] flex-shrink-0">↩</span>
              )}
            </div>
          );
        })}
        {bookings.length > 2 && (
          <p className="text-[10px] text-charcoal/40 px-1">
            +{bookings.length - 2} {isEn ? 'more' : 'de plus'}
          </p>
        )}
      </div>

      {taxis.map((t) => {
        const dirLabel =
          t.direction === 'aller'
            ? isEn
              ? 'Go'
              : 'Aller'
            : isEn
              ? 'Return'
              : 'Retour';
        const dirIcon = t.direction === 'aller' ? '→' : '↩';
        const timeLabel = t.time ?? (isEn ? 'TBD' : 'À confirmer');
        const tooltip = `Pet Taxi ${dirLabel} — ${t.clientName} — ${t.pets} — ${timeLabel}`;
        const firstPet = t.pets.split(', ')[0];
        return (
          <div
            key={`${t.bookingId}-${t.direction}`}
            title={tooltip}
            className="text-[10px] leading-tight px-1.5 py-0.5 rounded border flex items-center gap-1 overflow-hidden bg-orange-50 border-orange-200 text-orange-700 cursor-help mt-0.5"
          >
            <span className="truncate font-medium">
              🚗 {firstPet} {dirIcon}
            </span>
          </div>
        );
      })}
    </div>
  );
}
