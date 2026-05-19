'use client';

// Live Pet Taxi banner — shown on a client's booking detail page when a
// trip is actively in progress.  Links to the existing /track/[token]
// page (Leaflet map + ETA + driver photo).  This is the "Uber-grade"
// tracking feeling the audit asked for, minus the heavy embed cost.
//
// Source : Wave 5 (UX classe mondiale, Feature #6).

import Link from 'next/link';
import { MapPin, Car, ArrowRight } from 'lucide-react';

interface Props {
  trackingToken: string;
  tripStatus: string;
  petName: string | null;
  locale: string;
}

const ACTIVE_STATUSES = new Set([
  'DRIVER_EN_ROUTE',
  'ON_SITE_CLIENT',
  'ANIMAL_ON_BOARD',
  'ON_SITE_PENSION',
]);

const STATUS_LABELS: Record<string, { fr: string; en: string }> = {
  DRIVER_EN_ROUTE: { fr: 'Chauffeur en route', en: 'Driver on the way' },
  ON_SITE_CLIENT:  { fr: 'Chauffeur sur place', en: 'Driver on site' },
  ANIMAL_ON_BOARD: { fr: 'À bord ! 🐾', en: 'On board! 🐾' },
  ON_SITE_PENSION: { fr: 'Arrivé à la pension', en: 'Arrived at the pension' },
};

export default function LiveTaxiBanner({ trackingToken, tripStatus, petName, locale }: Props) {
  if (!ACTIVE_STATUSES.has(tripStatus)) return null;

  const fr = locale === 'fr';
  const ar = locale === 'ar';
  const statusLabel = STATUS_LABELS[tripStatus]?.[fr ? 'fr' : 'en'] ?? tripStatus;
  const trackHref = `/${locale}/track/${trackingToken}`;

  return (
    <Link
      href={trackHref}
      className="block relative overflow-hidden rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-emerald-50 to-emerald-100 p-4 shadow-card hover:shadow-lg transition-all group"
    >
      {/* Animated pulse dot to signal liveness */}
      <span className="absolute top-3 right-3 flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
      </span>

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-emerald-200/60 flex items-center justify-center shrink-0">
          <Car className="h-6 w-6 text-emerald-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[2px] text-emerald-700 font-semibold">
            {fr ? 'En direct' : ar ? 'مباشر' : 'Live'}
          </p>
          <p className="text-base font-semibold text-emerald-900 mt-0.5">
            {statusLabel}
          </p>
          <p className="text-xs text-emerald-800/70 mt-0.5">
            {fr
              ? petName ? `Suivez le trajet de ${petName} en temps réel` : 'Suivez le trajet en temps réel'
              : ar
                ? petName ? `تابع رحلة ${petName} مباشرة` : 'تابع الرحلة مباشرة'
                : petName ? `Track ${petName}'s ride in real time` : `Track the ride in real time`}
          </p>
        </div>
        <div className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 group-hover:translate-x-1 transition-transform">
          <MapPin className="h-4 w-4" />
          {fr ? 'Carte' : 'Map'}
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
