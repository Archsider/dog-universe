'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AvailabilityCalendar } from '@/components/shared/AvailabilityCalendar';
import type { InitialStatus, Species, Translations } from './types';

interface Props {
  t: Translations;
  serviceType: 'BOARDING' | 'PET_TAXI';
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  arrivalTime: string;
  setArrivalTime: (v: string) => void;
  isOpenEnded: boolean;
  setIsOpenEnded: (v: boolean) => void;
  initialStatus: InitialStatus;
  calendarSpecies: Species;
  onCalendarRange: (start: string, end: string | null) => void;
}

/**
 * Dates section — three sub-controls:
 *   1. Open-ended toggle (BOARDING only, disabled when initialStatus=COMPLETED)
 *   2. start/end OR start/arrival-time grid (depends on serviceType)
 *   3. Availability calendar (BOARDING only, click-to-select range)
 *
 * `effectiveIsOpenEnded` is computed by the parent (it depends on
 * initialStatus) and surfaced here as the controlled checkbox value.
 */
export function DatesSection({
  t,
  serviceType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  arrivalTime,
  setArrivalTime,
  isOpenEnded,
  setIsOpenEnded,
  initialStatus,
  calendarSpecies,
  onCalendarRange,
}: Props) {
  const effectiveIsOpenEnded = isOpenEnded && initialStatus !== 'COMPLETED';

  return (
    <section className="bg-white rounded-xl border border-ivory-200 p-5 shadow-card">
      <h2 className="text-lg font-semibold text-charcoal mb-3">{t.datesSection}</h2>

      {serviceType === 'BOARDING' && (
        <label
          className={`flex items-center gap-2 mb-4 cursor-pointer ${initialStatus === 'COMPLETED' ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input
            type="checkbox"
            checked={effectiveIsOpenEnded}
            onChange={(e) => setIsOpenEnded(e.target.checked)}
            disabled={initialStatus === 'COMPLETED'}
            className="h-4 w-4"
          />
          <span className="text-sm text-charcoal">{t.openEndedToggle}</span>
        </label>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div>
          <Label htmlFor="start">{t.startDate} *</Label>
          <Input
            id="start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        {serviceType === 'BOARDING' ? (
          <div>
            <Label htmlFor="end">
              {t.endDate}
              {!effectiveIsOpenEnded && ' *'}
            </Label>
            <Input
              id="end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required={!effectiveIsOpenEnded}
              disabled={effectiveIsOpenEnded}
            />
          </div>
        ) : (
          <div>
            <Label htmlFor="time">{t.arrivalTime}</Label>
            <Input
              id="time"
              type="time"
              min="10:00"
              max="17:00"
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
            />
          </div>
        )}
      </div>

      {effectiveIsOpenEnded && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
          {t.openEndedNote}
        </p>
      )}

      {serviceType === 'BOARDING' && (
        <AvailabilityCalendar
          species={calendarSpecies}
          selectedStart={startDate || null}
          selectedEnd={endDate || null}
          onRangeSelect={onCalendarRange}
          interactive
        />
      )}
    </section>
  );
}
