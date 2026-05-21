// Arrivées & Départs prévus J→J+7 — Zone 2. Côte à côte.

import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Home } from 'lucide-react';
import type { UpcomingSnapshot } from '../_lib/queries';
import { formatCasaShortDate } from '../_lib/helpers';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  locale: string;
  snapshot: UpcomingSnapshot;
  labels: DashboardLabels;
}

export function UpcomingCards({ locale, snapshot, labels }: Props) {
  const { arrivals, departures, recentDepartures, totalArrivals, totalDepartures, totalRecentDepartures } = snapshot;
  const fr = locale === 'fr' ? 'fr' : 'en';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-charcoal text-sm uppercase tracking-wider">
            {labels.arrivalsTitle}
          </h3>
          <ArrowDownRight className="h-4 w-4 text-emerald-600" />
        </div>
        <p className="text-xs text-gray-500 mb-3">{labels.arrivalsCount(totalArrivals)}</p>
        {arrivals.length === 0 ? (
          <p className="text-xs text-gray-400 italic">{labels.noUpcoming}</p>
        ) : (
          <ul className="space-y-2">
            {arrivals.map((a) => (
              <li key={a.bookingId}>
                <Link
                  href={`/${locale}/admin/reservations/${a.bookingId}`}
                  className="flex items-baseline gap-2 text-sm hover:text-[#C4974A]"
                >
                  <span className="text-emerald-700 font-medium tabular-nums text-xs w-14 flex-shrink-0">
                    {formatCasaShortDate(a.dateYmd, fr)}
                  </span>
                  <span className="truncate text-charcoal">
                    {a.petName}
                    <span className="text-gray-400"> · {a.clientName}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {totalArrivals > arrivals.length && (
          <Link
            href={`/${locale}/admin/reservations?view=upcoming`}
            className="inline-block mt-3 text-xs text-[#C4974A] hover:text-[#9A7235] font-medium"
          >
            {labels.viewAll}
          </Link>
        )}
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-charcoal text-sm uppercase tracking-wider">
            {labels.departuresTitle}
          </h3>
          <ArrowUpRight className="h-4 w-4 text-blue-600" />
        </div>
        <p className="text-xs text-gray-500 mb-3">{labels.departuresCount(totalDepartures)}</p>
        {departures.length === 0 ? (
          <p className="text-xs text-gray-400 italic">{labels.noUpcoming}</p>
        ) : (
          <ul className="space-y-2">
            {departures.map((d) => (
              <li key={d.bookingId}>
                <Link
                  href={`/${locale}/admin/reservations/${d.bookingId}`}
                  className="flex items-baseline gap-2 text-sm hover:text-[#C4974A]"
                >
                  <span className="text-blue-700 font-medium tabular-nums text-xs w-14 flex-shrink-0">
                    {formatCasaShortDate(d.dateYmd, fr)}
                  </span>
                  <span className="truncate text-charcoal">
                    {d.petName}
                    <span className="text-gray-400"> · {d.clientName}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {totalDepartures > departures.length && (
          <Link
            href={`/${locale}/admin/reservations?view=in-progress`}
            className="inline-block mt-3 text-xs text-[#C4974A] hover:text-[#9A7235] font-medium"
          >
            {labels.viewAll}
          </Link>
        )}
      </div>

      {/* Récemment partis — séjours COMPLETED des 7 derniers jours.
          Style plus discret (passé) que les 2 cards prévisionnelles. */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-charcoal text-sm uppercase tracking-wider">
            {labels.recentDeparturesTitle}
          </h3>
          <Home className="h-4 w-4 text-gray-400" />
        </div>
        <p className="text-xs text-gray-500 mb-3">{labels.recentDeparturesCount(totalRecentDepartures)}</p>
        {recentDepartures.length === 0 ? (
          <p className="text-xs text-gray-400 italic">{labels.noRecentDepartures}</p>
        ) : (
          <ul className="space-y-2">
            {recentDepartures.map((d) => (
              <li key={d.bookingId}>
                <Link
                  href={`/${locale}/admin/reservations/${d.bookingId}`}
                  className="flex items-baseline gap-2 text-sm hover:text-[#C4974A]"
                >
                  <span className="text-gray-500 font-medium tabular-nums text-xs w-14 flex-shrink-0">
                    {formatCasaShortDate(d.dateYmd, fr)}
                  </span>
                  <span className="truncate text-charcoal">
                    {d.petName}
                    <span className="text-gray-400"> · {d.clientName}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {totalRecentDepartures > recentDepartures.length && (
          <Link
            href={`/${locale}/admin/reservations?view=history`}
            className="inline-block mt-3 text-xs text-[#C4974A] hover:text-[#9A7235] font-medium"
          >
            {labels.viewAll}
          </Link>
        )}
      </div>
    </div>
  );
}
