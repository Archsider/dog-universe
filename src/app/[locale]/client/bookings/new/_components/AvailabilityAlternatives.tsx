'use client';

import { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';

interface Alternative {
  startYmd: string;
  endYmd: string;
  offsetDays: number;
}

interface Props {
  /** Requested window (YYYY-MM-DD). */
  start: string;
  end: string;
  dogs: number;
  cats: number;
  locale: string;
  /** Apply a suggested window to the form. */
  onPick: (start: string, end: string) => void;
}

function pick(locale: string, fr: string, en: string, ar: string): string {
  return locale === 'en' ? en : locale === 'ar' ? ar : fr;
}

function fmt(ymd: string, locale: string): string {
  const intlLocale = locale === 'en' ? 'en-GB' : locale === 'ar' ? 'ar-MA' : 'fr-FR';
  // Noon anchor → the day never shifts when formatted in the browser TZ.
  return new Date(`${ymd}T12:00:00`).toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' });
}

/**
 * When the requested boarding window is full, proactively offers the nearest
 * date windows that DO fit (same duration) as one-tap chips. Fail-silent: any
 * fetch/parse error simply renders nothing — never blocks the booking form.
 */
export function AvailabilityAlternatives({ start, end, dogs, cats, locale, onPick }: Props) {
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);

  useEffect(() => {
    if (!start || !end || dogs + cats === 0) {
      setAlternatives([]);
      return;
    }
    let cancelled = false;
    const qs = new URLSearchParams({ start, end, dogs: String(dogs), cats: String(cats) });
    fetch(`/api/availability/alternatives?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.alternatives)) return;
        setAlternatives(data.alternatives as Alternative[]);
      })
      .catch(() => {
        if (!cancelled) setAlternatives([]);
      });
    return () => {
      cancelled = true;
    };
  }, [start, end, dogs, cats]);

  if (alternatives.length === 0) return null;

  return (
    <div className="mt-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
      <p className="text-xs font-medium text-emerald-800 mb-2">
        {pick(
          locale,
          'Dates les plus proches disponibles pour la même durée :',
          'Closest available dates for the same length of stay:',
          'أقرب التواريخ المتاحة لنفس المدة:',
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {alternatives.map((a) => (
          <button
            key={a.startYmd}
            type="button"
            onClick={() => onPick(a.startYmd, a.endYmd)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-emerald-300 rounded-md text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            <CalendarCheck className="h-3.5 w-3.5" />
            {fmt(a.startYmd, locale)} → {fmt(a.endYmd, locale)}
          </button>
        ))}
      </div>
    </div>
  );
}
