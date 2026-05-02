'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DayData {
  date: string;
  booked: number;
  limit: number;
  available: number;
  status: 'available' | 'limited' | 'full';
}

interface AvailabilityResponse {
  species: 'DOG' | 'CAT';
  month: string;
  days: DayData[];
}

type Props = {
  species: 'DOG' | 'CAT';
  selectedStart?: string | null;
  selectedEnd?: string | null;
  onRangeSelect?: (start: string, end: string | null) => void;
  interactive?: boolean;
  initialMonth?: string;
};

const FR_MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const DAY_HEADERS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${FR_MONTHS[m - 1]} ${y}`;
}

function getDaysInMonth(month: string): { date: string; dayOfWeek: number }[] {
  const [y, m] = month.split('-').map(Number);
  const days: { date: string; dayOfWeek: number }[] = [];
  const daysCount = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
    // Convert to Mon-first (0=Mon..6=Sun)
    const monFirst = dow === 0 ? 6 : dow - 1;
    days.push({ date: dateStr, dayOfWeek: monFirst });
  }
  return days;
}

function isBefore(a: string, b: string): boolean {
  return a < b;
}

function isInRange(date: string, start: string | null | undefined, end: string | null | undefined): boolean {
  if (!start || !end) return false;
  const [s, e] = start <= end ? [start, end] : [end, start];
  return date >= s && date <= e;
}

export function AvailabilityCalendar({
  species,
  selectedStart,
  selectedEnd,
  onRangeSelect,
  interactive = true,
  initialMonth,
}: Props) {
  const [month, setMonth] = useState<string>(initialMonth ?? getCurrentMonth());
  const [data, setData] = useState<Map<string, DayData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ date: string; text: string } | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const fetchData = useCallback(async (m: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/availability?month=${m}&species=${species}`);
      if (!res.ok) return;
      const json: AvailabilityResponse = await res.json();
      const map = new Map<string, DayData>();
      for (const day of json.days) {
        map.set(day.date, day);
      }
      setData(map);
    } catch {
      // fail silently — calendar still renders
    } finally {
      setLoading(false);
    }
  }, [species]);

  useEffect(() => {
    fetchData(month);
  }, [month, fetchData]);

  const days = getDaysInMonth(month);
  // Padding before first day
  const firstDow = days[0]?.dayOfWeek ?? 0;

  const handleDayClick = (dateStr: string) => {
    if (!interactive || !onRangeSelect) return;
    const dayData = data.get(dateStr);
    if (isBefore(dateStr, today)) return;
    if (dayData?.status === 'full') return;

    if (!pendingStart) {
      // First click: set start
      setPendingStart(dateStr);
      onRangeSelect(dateStr, null);
    } else {
      // Second click: set end
      const [start, end] = dateStr < pendingStart
        ? [dateStr, pendingStart]
        : [pendingStart, dateStr];
      setPendingStart(null);
      onRangeSelect(start, end);
    }
  };

  const getTooltipText = (d: DayData): string => {
    if (d.status === 'full') return 'Complet';
    if (d.available === 1) return '1 place restante';
    return `${d.available} places restantes`;
  };

  const getDayClasses = (dateStr: string): string => {
    const isPast = isBefore(dateStr, today);
    const dayData = data.get(dateStr);

    // Selection state
    const currentStart = pendingStart ?? selectedStart;
    const currentEnd = pendingStart ? null : selectedEnd;
    const isStart = dateStr === currentStart;
    const isEnd = dateStr === currentEnd;
    const isSelected = isStart || isEnd;
    const isRange = isInRange(dateStr, currentStart, currentEnd);

    const base = 'relative flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors cursor-pointer select-none';

    if (isSelected) {
      return `${base} bg-blue-500 text-white`;
    }
    if (isRange) {
      return `${base} bg-blue-100 text-blue-900 rounded-none`;
    }
    if (isPast) {
      return `${base} bg-gray-100 text-gray-400 cursor-not-allowed`;
    }
    if (!dayData) {
      return `${base} text-gray-300 cursor-default`;
    }
    if (dayData.status === 'full') {
      return `${base} bg-red-100 text-red-800 cursor-not-allowed`;
    }
    if (dayData.status === 'limited') {
      return `${base} bg-yellow-100 text-yellow-800 hover:bg-yellow-200`;
    }
    return `${base} bg-green-100 text-green-800 hover:bg-green-200`;
  };

  return (
    <div className="bg-white rounded-xl border border-ivory-200 p-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setMonth((m) => addMonths(m, -1))}
          className="p-1 rounded hover:bg-gray-100 transition-colors text-charcoal/70 hover:text-charcoal"
          aria-label="Mois précédent"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-charcoal">{getMonthLabel(month)}</span>
          {loading && (
            <span className="inline-block w-3 h-3 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="p-1 rounded hover:bg-gray-100 transition-colors text-charcoal/70 hover:text-charcoal"
          aria-label="Mois suivant"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((h) => (
          <div key={h} className="text-center text-xs font-medium text-gray-400 py-1">
            {h}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {/* Leading empty cells */}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}

        {days.map(({ date, dayOfWeek: _dow }) => {
          const d = parseInt(date.slice(-2), 10);
          const dayData = data.get(date);
          const tooltipText = dayData ? getTooltipText(dayData) : null;

          return (
            <div key={date} className="flex items-center justify-center py-0.5 relative">
              <div
                className={getDayClasses(date)}
                onClick={() => handleDayClick(date)}
                onMouseEnter={() => tooltipText && setTooltip({ date, text: tooltipText })}
                onMouseLeave={() => setTooltip(null)}
                role={interactive ? 'button' : undefined}
                aria-label={tooltipText ? `${date}: ${tooltipText}` : date}
              >
                {d}
              </div>
              {/* Tooltip */}
              {tooltip?.date === date && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 pointer-events-none whitespace-nowrap">
                  <div className="bg-charcoal text-white text-xs rounded px-2 py-1 shadow-md">
                    {tooltip.text}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-100 border border-green-300" />
          <span className="text-xs text-gray-500">Disponible</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-300" />
          <span className="text-xs text-gray-500">Limité</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-100 border border-red-300" />
          <span className="text-xs text-gray-500">Complet</span>
        </div>
      </div>
    </div>
  );
}
