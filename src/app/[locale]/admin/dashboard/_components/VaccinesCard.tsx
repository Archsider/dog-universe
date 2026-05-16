// Vaccins à renouveler dans les 30 jours — Zone 3.

import { Syringe } from 'lucide-react';
import type { VaccineExpiry } from '../_lib/queries';
import { formatCasaShortDate } from '../_lib/helpers';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  locale: string;
  vaccines: VaccineExpiry[];
  labels: DashboardLabels;
}

export function VaccinesCard({ locale, vaccines, labels }: Props) {
  if (vaccines.length === 0) return null;
  const fr = locale === 'fr' ? 'fr' : 'en';
  return (
    <div className="bg-white rounded-xl border border-purple-200/60 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-md bg-purple-50 flex items-center justify-center">
          <Syringe className="h-3.5 w-3.5 text-purple-600" />
        </div>
        <h3 className="font-semibold text-charcoal text-sm uppercase tracking-wider">
          {labels.vaccinesTitle}
        </h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">{labels.vaccinesCount(vaccines.length)}</p>
      <ul className="space-y-1.5">
        {vaccines.slice(0, 5).map((v, i) => (
          <li key={`${v.petName}-${v.expiryYmd}-${i}`} className="text-sm flex items-baseline gap-2">
            <span className="text-charcoal font-medium">{v.petName}</span>
            <span className="text-gray-400">({v.ownerName})</span>
            <span className="text-gray-500">— {v.vaccineType}</span>
            <span className="ml-auto text-purple-700 font-medium tabular-nums text-xs">
              {labels.expiresOn} {formatCasaShortDate(v.expiryYmd, fr)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
