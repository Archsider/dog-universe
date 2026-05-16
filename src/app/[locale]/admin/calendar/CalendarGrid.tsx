/* eslint-disable dog-universe/no-getmonth-on-date-casa --
 * OK: client-side UI / calendar grid helpers. These operate either on
 * <input type="date"> values (already local-time) or on (year, month, day)
 * primitives previously extracted via casablancaYMD upstream. The Vercel UTC
 * runtime is not in scope here — the browser is.
 */
'use client';

// Slim orchestrator — see _lib/ and _components/ for the extracted helpers
// and section components.
//
// File went from 504 LOC to ~95 by extracting:
//   - _lib/calendar-helpers.ts        (180L) types + constants + isBookingActiveOnDay
//                                            + precomputeMaps (4 indexes)
//   - _components/MonthHeader.tsx     (35L)  prev/next + month title
//   - _components/DayCell.tsx         (130L) single day cell with chips + taxi indicators
//   - _components/Legend.tsx          (50L)  status colours legend at bottom
//   - _components/SelectedDayPanel.tsx (210L) right-hand details panel
//
// Re-exporting CalendarBooking so the page that consumes this component
// keeps the same import path.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  type CalendarBooking,
  DAY_NAMES_EN,
  DAY_NAMES_FR,
  MONTH_NAMES_EN,
  MONTH_NAMES_FR,
  STATUS_LABEL_EN,
  STATUS_LABEL_FR,
  precomputeMaps,
} from './_lib/calendar-helpers';
import { MonthHeader } from './_components/MonthHeader';
import { DayCell } from './_components/DayCell';
import { Legend } from './_components/Legend';
import { SelectedDayPanel } from './_components/SelectedDayPanel';

export type { CalendarBooking };

interface Props {
  year: number;
  month: number;
  locale: string;
  bookings: CalendarBooking[];
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

  const { dayBookingsMap, dayDepartureIds, dayArrivalIds, dayTaxiMap } =
    precomputeMaps(bookings, year, month, daysInMonth);

  const selectedBookings = selectedDay ? (dayBookingsMap.get(selectedDay) ?? []) : [];
  const selectedTaxis = selectedDay ? (dayTaxiMap.get(selectedDay) ?? []) : [];

  return (
    <div className="flex flex-col xl:flex-row gap-6">
      {/* Calendar */}
      <div className="flex-1 bg-white rounded-2xl border border-ivory-200 shadow-sm overflow-hidden">
        <MonthHeader
          monthName={monthNames[month - 1]}
          year={year}
          onPrev={() => navigate(-1)}
          onNext={() => navigate(1)}
        />

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-ivory-200 bg-ivory-50/50">
          {dayNames.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-xs font-semibold text-charcoal/40 uppercase tracking-wide"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="min-h-[88px] border-b border-r border-ivory-100 bg-gray-50/20"
            />
          ))}

          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const dayBks = dayBookingsMap.get(day) ?? [];
            const dayTaxis = dayTaxiMap.get(day) ?? [];
            const isToday = isCurrentMonth && today.getDate() === day;
            const isSelected = selectedDay === day;
            return (
              <DayCell
                key={day}
                day={day}
                isToday={isToday}
                isSelected={isSelected}
                isEn={isEn}
                bookings={dayBks}
                taxis={dayTaxis}
                departureIds={dayDepartureIds.get(day)}
                arrivalIds={dayArrivalIds.get(day)}
                onClick={() => setSelectedDay(isSelected ? null : day)}
              />
            );
          })}
        </div>

        <Legend isEn={isEn} statusLabels={statusLabel} />
      </div>

      {selectedDay !== null && (
        <SelectedDayPanel
          isEn={isEn}
          locale={locale}
          selectedDay={selectedDay}
          monthName={monthNames[month - 1]}
          year={year}
          bookings={selectedBookings}
          taxis={selectedTaxis}
          departureIds={dayDepartureIds.get(selectedDay)}
          arrivalIds={dayArrivalIds.get(selectedDay)}
          statusLabels={statusLabel}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
