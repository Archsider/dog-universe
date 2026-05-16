// Carte "Aujourd'hui" — Zone 1.
// 3 colonnes : Check-in / Check-out / Pet Taxi. Compteurs + listes
// compactes. Empty state stylisé "Tout est calme 🌙" si zero everything.

import Link from 'next/link';
import { LogIn, LogOut, Car } from 'lucide-react';
import type { TodaySnapshot } from '../_lib/queries';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  locale: string;
  snapshot: TodaySnapshot;
  labels: DashboardLabels;
}

function speciesEmoji(s: 'DOG' | 'CAT'): string {
  return s === 'CAT' ? '🐱' : '🐶';
}

function petsAndSpeciesCounts(rows: Array<{ primaryPetSpecies: 'DOG' | 'CAT'; petNames: string[] }>) {
  let dogs = 0;
  let cats = 0;
  for (const r of rows) {
    // primaryPetSpecies counts the lead pet — for multi-pet bookings the
    // detail panel handles the breakdown. Mehdi confirmed dashboard rolls
    // up at booking-level for the today widget.
    if (r.primaryPetSpecies === 'DOG') dogs++;
    else cats++;
  }
  return { dogs, cats };
}

export function AujourdhuiCard({ locale, snapshot, labels }: Props) {
  const { checkIns, checkOuts, taxiRuns } = snapshot;
  const isQuiet = checkIns.length === 0 && checkOuts.length === 0 && taxiRuns.length === 0;
  if (isQuiet) {
    return (
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-8 shadow-card">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="text-5xl mb-3" aria-hidden="true">🌙</div>
          <p className="font-semibold text-charcoal text-base">{labels.todayQuiet}</p>
          <p className="text-sm text-gray-500 mt-1">{labels.todayQuietSub}</p>
        </div>
      </div>
    );
  }

  const inCounts = petsAndSpeciesCounts(checkIns);
  const outCounts = petsAndSpeciesCounts(checkOuts);

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal text-sm uppercase tracking-wider mb-4">
        {labels.todayTitle}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Check-in */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-md bg-emerald-50 flex items-center justify-center">
              <LogIn className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              {labels.checkInsLabel}
            </span>
          </div>
          <p className="text-sm font-medium text-charcoal mb-2 tabular-nums">
            {inCounts.dogs} 🐕 · {inCounts.cats} 🐈
          </p>
          {checkIns.length > 0 && (
            <ul className="space-y-1.5">
              {checkIns.slice(0, 3).map((b) => (
                <li key={b.bookingId}>
                  <Link
                    href={`/${locale}/admin/reservations/${b.bookingId}`}
                    className="text-xs text-gray-600 hover:text-[#C4974A] flex items-center gap-1.5"
                  >
                    {b.arrivalTime && (
                      <span className="text-emerald-600 font-medium tabular-nums w-10">{b.arrivalTime}</span>
                    )}
                    <span className="truncate">
                      {speciesEmoji(b.primaryPetSpecies)} {b.petNames.join(', ')}
                      <span className="text-gray-400"> · {b.clientName}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Check-out */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-md bg-blue-50 flex items-center justify-center">
              <LogOut className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
              {labels.checkOutsLabel}
            </span>
          </div>
          <p className="text-sm font-medium text-charcoal mb-2 tabular-nums">
            {outCounts.dogs} 🐕 · {outCounts.cats} 🐈
          </p>
          {checkOuts.length > 0 && (
            <ul className="space-y-1.5">
              {checkOuts.slice(0, 3).map((b) => (
                <li key={b.bookingId}>
                  <Link
                    href={`/${locale}/admin/reservations/${b.bookingId}`}
                    className="text-xs text-gray-600 hover:text-[#C4974A] flex items-center gap-1.5"
                  >
                    <span className="truncate">
                      {speciesEmoji(b.primaryPetSpecies)} {b.petNames.join(', ')}
                      <span className="text-gray-400"> · {b.clientName}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pet Taxi */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-md bg-purple-50 flex items-center justify-center">
              <Car className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">
              {labels.petTaxiLabel}
            </span>
          </div>
          <p className="text-sm font-medium text-charcoal mb-2 tabular-nums">
            {taxiRuns.length} course{taxiRuns.length > 1 ? 's' : ''}
          </p>
          {taxiRuns.length > 0 && (
            <ul className="space-y-1.5">
              {taxiRuns.slice(0, 3).map((t) => (
                <li key={t.bookingId}>
                  <Link
                    href={`/${locale}/admin/reservations/${t.bookingId}`}
                    className="text-xs text-gray-600 hover:text-[#C4974A] flex items-center gap-1.5"
                  >
                    {t.arrivalTime && (
                      <span className="text-purple-600 font-medium tabular-nums w-10">{t.arrivalTime}</span>
                    )}
                    <span className="truncate">
                      {t.petName}
                      <span className="text-gray-400"> · {t.clientName}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
