'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, PawPrint, Car, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookingPet {
  pet: { name: string; species: string };
}

export interface CalendarBooking {
  id: string;
  serviceType: string;
  status: string;
  startDate: string;
  endDate: string | null;
  client: { name: string };
  bookingPets: BookingPet[];
}

interface Props {
  year: number;
  month: number;
  locale: string;
  bookings: CalendarBooking[];
}

const DAY_NAMES_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAY_NAMES_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_CHIP: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  COMPLETED: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_LABEL_FR: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmé',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminé',
};
const STATUS_LABEL_EN: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

function isBookingActiveOnDay(b: CalendarBooking, year: number, month: number, day: number): boolean {
  const dayDate = new Date(year, month - 1, day, 12, 0, 0);

  if (b.serviceType === 'PET_TAXI') {
    const start = new Date(b.startDate);
    return (
      start.getFullYear() === year &&
      start.getMonth() + 1 === month &&
      start.getDate() === day
    );
  }

  // BOARDING
  const start = new Date(b.startDate);
  start.setHours(0, 0, 0, 0);
  const end = b.endDate ? new Date(b.endDate) : null;
  if (end) end.setHours(23, 59, 59, 0);

  return start <= dayDate && (!end || end >= dayDate);
}

export function CalendarGrid({ year, month, locale, bookings }: Props) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const isEn = locale === 'en';
  const dayNames = isEn ? DAY_NAMES_EN : DAY_NAMES_FR;
  const monthNames = isEn ? MONTH_NAMES_EN : MONTH_NAMES_FR;
  const statusLabel = isEn ? STATUS_LABEL_EN : STATUS_LABEL_FR;

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1);
  let startOffset = firstDayOfMonth.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  const navigate = (dir: number) => {
    let m = month + dir;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    router.push(`?year=${y}&month=${m}`);
    setSelectedDay(null);
  };

  // Precompute bookings per day
  const dayBookingsMap = new Map<number, CalendarBooking[]>();
  for (let d = 1; d <= daysInMonth; d++) {
    const active = bookings.filter((b) => isBookingActiveOnDay(b, year, month, d));
    if (active.length > 0) dayBookingsMap.set(d, active);
  }

  const selectedBookings = selectedDay ? (dayBookingsMap.get(selectedDay) ?? []) : [];

  return (
    <div className="flex flex-col xl:flex-row gap-6">
      {/* Calendar */}
      <div className="flex-1 bg-white rounded-2xl border border-ivory-200 shadow-sm overflow-hidden">
        {/* Month header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ivory-200">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-ivory-50 text-charcoal/60 hover:text-charcoal transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-serif font-bold text-charcoal">
            {monthNames[month - 1]} {year}
          </h2>
          <button
            onClick={() => navigate(1)}
            className="p-2 rounded-lg hover:bg-ivory-50 text-charcoal/60 hover:text-charcoal transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-ivory-200 bg-ivory-50/50">
          {dayNames.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-charcoal/40 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7">
          {/* Empty cells before first day */}
          {Array.from({ length: startOffset }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="min-h-[88px] border-b border-r border-ivory-100 bg-gray-50/20"
            />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const dayBks = dayBookingsMap.get(day) ?? [];
            const isToday = isCurrentMonth && today.getDate() === day;
            const isSelected = selectedDay === day;
            const hasBoardings = dayBks.length > 0;

            return (
              <div
                key={day}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={cn(
                  'min-h-[88px] border-b border-r border-ivory-100 p-1.5 cursor-pointer transition-colors select-none',
                  isSelected
                    ? 'bg-gold-50 ring-1 ring-inset ring-gold-300'
                    : hasBoardings
                    ? 'bg-[#FDF8F0] hover:bg-[#FAF4E8]'
                    : 'hover:bg-ivory-50',
                )}
              >
                {/* Day number */}
                <div
                  className={cn(
                    'w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1.5',
                    isToday
                      ? 'bg-gold-500 text-white'
                      : 'text-charcoal/70',
                  )}
                >
                  {day}
                </div>

                {/* Booking chips */}
                <div className="space-y-0.5">
                  {dayBks.slice(0, 2).map((b) => {
                    const petName = b.bookingPets[0]?.pet.name ?? '?';
                    const extra = b.bookingPets.length > 1 ? ` +${b.bookingPets.length - 1}` : '';
                    return (
                      <div
                        key={b.id}
                        className={cn(
                          'text-[10px] leading-tight px-1.5 py-0.5 rounded border flex items-center gap-1 overflow-hidden',
                          STATUS_CHIP[b.status] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                        )}
                      >
                        {b.serviceType === 'PET_TAXI' ? (
                          <Car className="h-2.5 w-2.5 flex-shrink-0" />
                        ) : (
                          <PawPrint className="h-2.5 w-2.5 flex-shrink-0" />
                        )}
                        <span className="truncate font-medium">{petName}{extra}</span>
                      </div>
                    );
                  })}
                  {dayBks.length > 2 && (
                    <p className="text-[10px] text-charcoal/40 px-1">
                      +{dayBks.length - 2} {isEn ? 'more' : 'de plus'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 border-t border-ivory-100 bg-ivory-50/50">
          <span className="text-xs text-charcoal/40 font-medium">{isEn ? 'Legend:' : 'Légende :'}</span>
          {[
            { label: statusLabel.PENDING, color: 'bg-amber-100 border-amber-200' },
            { label: statusLabel.CONFIRMED, color: 'bg-green-100 border-green-200' },
            { label: statusLabel.IN_PROGRESS, color: 'bg-blue-100 border-blue-200' },
            { label: statusLabel.COMPLETED, color: 'bg-gray-100 border-gray-200' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={cn('w-3 h-3 rounded border', item.color)} />
              <span className="text-xs text-charcoal/50">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2">
            <PawPrint className="h-3 w-3 text-charcoal/40" />
            <span className="text-xs text-charcoal/50">Boarding</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Car className="h-3 w-3 text-charcoal/40" />
            <span className="text-xs text-charcoal/50">Taxi</span>
          </div>
        </div>
      </div>

      {/* Side panel: selected day detail */}
      {selectedDay !== null && (
        <div className="xl:w-80 bg-white rounded-2xl border border-ivory-200 shadow-sm overflow-hidden self-start xl:sticky xl:top-24">
          <div className="flex items-center justify-between px-5 py-4 border-b border-ivory-100">
            <h3 className="font-serif font-bold text-charcoal">
              {selectedDay} {monthNames[month - 1]} {year}
            </h3>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-charcoal/40 hover:text-charcoal transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4">
            {selectedBookings.length === 0 ? (
              <p className="text-sm text-charcoal/40 text-center py-6">
                {isEn ? 'No bookings this day' : 'Aucune réservation ce jour'}
              </p>
            ) : (
              <div className="space-y-3">
                {selectedBookings.map((b) => (
                  <a
                    key={b.id}
                    href={`/${locale}/admin/reservations/${b.id}`}
                    className="block p-3 rounded-xl border border-ivory-200 hover:border-gold-300 hover:bg-ivory-50 transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        {b.serviceType === 'PET_TAXI' ? (
                          <Car className="h-3.5 w-3.5 text-charcoal/40" />
                        ) : (
                          <PawPrint className="h-3.5 w-3.5 text-charcoal/40" />
                        )}
                        <span className="text-xs font-semibold text-charcoal">
                          {b.serviceType === 'BOARDING' ? (isEn ? 'Boarding' : 'Pension') : 'Taxi'}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded border',
                          STATUS_CHIP[b.status] ?? 'bg-gray-100 border-gray-200 text-gray-600',
                        )}
                      >
                        {statusLabel[b.status] ?? b.status}
                      </span>
                    </div>
                    <p className="text-xs text-charcoal/50 mb-0.5">{b.client.name}</p>
                    <p className="text-xs font-medium text-charcoal group-hover:text-gold-700 transition-colors">
                      {b.bookingPets.map((bp) => bp.pet.name).join(', ')}
                    </p>
                    {b.bookingPets.length > 0 && (
                      <p className="text-[10px] text-charcoal/40 mt-0.5">
                        {b.bookingPets.map((bp) => bp.pet.species === 'DOG' ? '🐶' : '🐱').join(' ')}
                      </p>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
