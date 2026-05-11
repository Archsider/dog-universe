'use client';

import { Home, ArrowRight, ArrowLeft, Car } from 'lucide-react';
import type { Stats, AllBoardingTaxi } from '../_lib/types';

interface Labels {
  activeBoarders: string;
  arrivals: string;
  departures: string;
  taxis: string;
  at: string;
}

export function StatsCards({
  stats,
  todayBoardingTaxisList,
  labels,
}: {
  stats: Stats;
  todayBoardingTaxisList: AllBoardingTaxi[];
  labels: Labels;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
            <Home className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-serif font-bold text-charcoal">{stats.activeBoarders}</p>
            <p className="text-xs text-charcoal/50">{labels.activeBoarders}</p>
          </div>
        </div>
        {(stats.dogCount > 0 || stats.catCount > 0) && (
          <p className="text-xs text-gray-400 mt-2 pl-12">
            {stats.dogCount > 0 && `🐕 ${stats.dogCount}`}
            {stats.dogCount > 0 && stats.catCount > 0 && ' · '}
            {stats.catCount > 0 && `🐈 ${stats.catCount}`}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <ArrowRight className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-serif font-bold text-charcoal">{stats.todayArrivals}</p>
            <p className="text-xs text-charcoal/50">{labels.arrivals}</p>
          </div>
        </div>
        {stats.todayArrivalDetails.length > 0 && (
          <ul className="mt-2 space-y-0.5 pl-12">
            {stats.todayArrivalDetails.slice(0, 3).map((d) => (
              <li key={d.id} className="text-xs text-gray-500 truncate">
                {d.clientName} — {d.pets}
                {d.arrivalTime && <span className="text-gray-400"> {labels.at} {d.arrivalTime}</span>}
              </li>
            ))}
            {stats.todayArrivalDetails.length > 3 && (
              <li className="text-xs text-gray-400">+{stats.todayArrivalDetails.length - 3} autres</li>
            )}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
            <ArrowLeft className="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-serif font-bold text-charcoal">{stats.todayDepartures}</p>
            <p className="text-xs text-charcoal/50">{labels.departures}</p>
          </div>
        </div>
        {stats.todayDepartureDetails.length > 0 && (
          <ul className="mt-2 space-y-0.5 pl-12">
            {stats.todayDepartureDetails.slice(0, 3).map((d) => (
              <li key={d.id} className="text-xs text-gray-500 truncate">
                {d.clientName} — {d.pets}
              </li>
            ))}
            {stats.todayDepartureDetails.length > 3 && (
              <li className="text-xs text-gray-400">+{stats.todayDepartureDetails.length - 3} autres</li>
            )}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
            <Car className="h-4 w-4 text-orange-600" />
          </div>
          <div>
            <p className="text-2xl font-serif font-bold text-charcoal">{stats.todayTaxis}</p>
            <p className="text-xs text-charcoal/50">{labels.taxis}</p>
          </div>
        </div>
        {todayBoardingTaxisList.length > 0 && (
          <ul className="mt-2 space-y-0.5 pl-12">
            {todayBoardingTaxisList.slice(0, 3).map((t) => (
              <li key={`${t.bookingId}-${t.direction}`} className="text-xs text-gray-500 truncate">
                {t.clientName} — {t.pets}
                {t.time && <span className="text-gray-400"> {labels.at} {t.time}</span>}
              </li>
            ))}
            {todayBoardingTaxisList.length > 3 && (
              <li className="text-xs text-gray-400">+{todayBoardingTaxisList.length - 3} autres</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
