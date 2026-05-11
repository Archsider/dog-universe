'use client';

import Link from 'next/link';
import { ArrowLeft, Car } from 'lucide-react';
import type { Stats, AllBoardingTaxi } from '../_lib/types';
import { formatDateShortLocal } from '../_lib/format';

export function UpcomingDepartures({ stats, locale, isFr }: { stats: Stats; locale: string; isFr: boolean }) {
  if (stats.upcomingDepartureDetails.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-purple-100 shadow-card p-4">
      <h3 className="text-sm font-semibold text-charcoal mb-3 flex items-center gap-2">
        <ArrowLeft className="h-4 w-4 text-purple-600" />
        {isFr ? 'Départs à venir — 7 prochains jours' : 'Upcoming departures — next 7 days'}
      </h3>
      <div className="space-y-2">
        {stats.upcomingDepartureDetails.map((d) => (
          <Link
            key={d.id}
            href={`/${locale}/admin/reservations/${d.id}`}
            className="flex items-center gap-1.5 text-sm hover:text-gold-700 transition-colors"
          >
            <span className="text-xs font-semibold text-purple-700 min-w-[72px]">
              {formatDateShortLocal(d.endDate, locale)}
            </span>
            <span className="text-charcoal/30">—</span>
            <span className="font-medium text-charcoal">{d.clientName}</span>
            <span className="text-charcoal/30">—</span>
            <span className="text-charcoal/70">{d.pets}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function UpcomingTaxis({
  stats,
  locale,
  isFr,
  taxiSoonLabel,
}: {
  stats: Stats;
  locale: string;
  isFr: boolean;
  taxiSoonLabel: string;
}) {
  if (stats.upcomingTaxiDetails.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-blue-100 shadow-card p-4">
      <h3 className="text-sm font-semibold text-charcoal mb-3 flex items-center gap-2">
        <Car className="h-4 w-4 text-blue-600" />
        {taxiSoonLabel}
      </h3>
      <div className="space-y-2">
        {stats.upcomingTaxiDetails.map((d) => (
          <Link
            key={d.id}
            href={`/${locale}/admin/reservations/${d.bookingId}`}
            className="flex items-center gap-1.5 text-sm hover:text-gold-700 transition-colors flex-wrap"
          >
            <span className="text-xs font-semibold text-blue-700 min-w-[72px]">
              {formatDateShortLocal(d.startDate, locale)}
            </span>
            <span className="text-charcoal/30">—</span>
            <span className="font-medium text-charcoal">{d.clientName}</span>
            <span className="text-charcoal/30">—</span>
            <span className="text-charcoal/70">{d.pets}</span>
            {d.direction && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">
                🚗 {d.direction === 'GO' ? (isFr ? 'Aller' : 'Go') : (isFr ? 'Retour' : 'Return')}
              </span>
            )}
            {d.time && (
              <span className="text-charcoal/40 text-xs ml-1">{isFr ? 'à' : 'at'} {d.time}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function TodayBoardingTaxis({
  todayBoardingTaxisList,
  isFr,
}: {
  todayBoardingTaxisList: AllBoardingTaxi[];
  isFr: boolean;
}) {
  if (todayBoardingTaxisList.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-orange-100 shadow-card p-4">
      <h3 className="text-sm font-semibold text-charcoal mb-3 flex items-center gap-2">
        <Car className="h-4 w-4 text-orange-600" />
        {isFr ? 'Pet Taxi du jour' : "Today's Pet Taxi"}
      </h3>
      <div className="space-y-2">
        {todayBoardingTaxisList.map((t) => {
          const dirLabel = t.direction === 'GO'
            ? (isFr ? 'Aller' : 'Go')
            : (isFr ? 'Retour' : 'Return');
          const timeLabel = t.time ?? (isFr ? 'À confirmer' : 'TBD');
          return (
            <div key={`${t.bookingId}-${t.direction}`} className="flex items-center gap-1.5 text-sm flex-wrap">
              <span className="font-medium text-charcoal">{t.clientName}</span>
              <span className="text-charcoal/30">—</span>
              <span className="text-charcoal/70">{t.pets}</span>
              <span className="text-charcoal/30">—</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 text-xs font-medium">
                🚗 {dirLabel}
              </span>
              <span className="text-charcoal/30">—</span>
              <span className={t.time ? 'text-charcoal font-medium' : 'text-charcoal/40 italic text-xs'}>
                {timeLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
