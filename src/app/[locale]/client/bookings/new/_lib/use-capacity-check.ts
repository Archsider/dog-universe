/* eslint-disable dog-universe/no-getmonth-on-date-casa --
 * OK: client-side UI / calendar grid helpers. These operate either on
 * <input type="date"> values (already local-time) or on (year, month, day)
 * primitives previously extracted via casablancaYMD upstream. The Vercel UTC
 * runtime is not in scope here — the browser is.
 */
'use client';

import { useEffect, useState } from 'react';
import type { BookingType } from './types';

export type CapacityStatus = 'ok' | 'limited' | 'full' | null;

/**
 * Pre-flight capacity check: when checkIn/checkOut change, fetch availability
 * for the relevant species and the months covered by the range. Debounced 400ms.
 */
export function useCapacityCheck(
  bookingType: BookingType,
  checkIn: string,
  checkOut: string,
  dogCount: number,
  catCount: number,
): CapacityStatus {
  const [capacityStatus, setCapacityStatus] = useState<CapacityStatus>(null);

  useEffect(() => {
    if (bookingType !== 'BOARDING' || !checkIn || !checkOut || dogCount + catCount === 0) {
      setCapacityStatus(null);
      return;
    }
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      setCapacityStatus(null);
      return;
    }
    const speciesList: Array<'DOG' | 'CAT'> = [];
    if (dogCount > 0) speciesList.push('DOG');
    if (catCount > 0) speciesList.push('CAT');
    const months = new Set<string>();
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      months.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const handle = setTimeout(async () => {
      try {
        const startISO = start.toISOString().slice(0, 10);
        const endISO = end.toISOString().slice(0, 10);
        let worst: 'ok' | 'limited' | 'full' = 'ok';
        for (const species of speciesList) {
          for (const month of months) {
            const res = await fetch(`/api/availability?month=${month}&species=${species}`);
            if (!res.ok) continue;
            const data = await res.json() as { days?: Array<{ date: string; status: 'available' | 'limited' | 'full' }> };
            for (const d of data.days ?? []) {
              if (d.date < startISO || d.date > endISO) continue;
              if (d.status === 'full') worst = 'full';
              else if (d.status === 'limited' && worst !== 'full') worst = 'limited';
            }
          }
        }
        setCapacityStatus(worst);
      } catch {
        setCapacityStatus(null);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [bookingType, checkIn, checkOut, dogCount, catCount]);

  return capacityStatus;
}
