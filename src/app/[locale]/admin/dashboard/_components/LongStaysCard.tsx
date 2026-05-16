// Séjours longue durée IN_PROGRESS > 21 jours — Zone 3.
// Action plutôt que constat : chaque ligne a un CTA "Contacter le client →"
// qui ouvre wa.me avec message pré-rempli en français.

import { Clock, MessageCircle } from 'lucide-react';
import type { LongStayItem } from '../_lib/queries';
import { formatCasaShortDate } from '../_lib/helpers';
import { buildLongStayMessage, buildWhatsAppUrl } from '../_lib/whatsapp';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  locale: string;
  items: LongStayItem[];
  labels: DashboardLabels;
}

export function LongStaysCard({ locale, items, labels }: Props) {
  if (items.length === 0) return null;
  const fr = locale === 'fr' ? 'fr' : 'en';
  return (
    <div className="bg-white rounded-xl border border-orange-200/60 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-md bg-orange-50 flex items-center justify-center">
          <Clock className="h-3.5 w-3.5 text-orange-600" />
        </div>
        <h3 className="font-semibold text-charcoal text-sm uppercase tracking-wider">
          {labels.longStaysTitle}
        </h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">{labels.longStaysSub(items.length)}</p>
      <ul className="space-y-3">
        {items.map((s) => {
          const waUrl = buildWhatsAppUrl(
            s.ownerPhone,
            buildLongStayMessage({
              petName: s.petName,
              daysInPension: s.daysInPension,
              locale: fr,
            }),
          );
          return (
            <li key={s.bookingId} className="border-l-2 border-orange-200 pl-3">
              <p className="text-sm font-medium text-charcoal">
                {s.petName}
                <span className="text-gray-500 font-normal"> ({s.ownerName})</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {labels.arrivedOn} {formatCasaShortDate(s.startDateYmd, fr)}
                <span className="text-orange-700 font-medium ml-2">
                  · {labels.daysInPensionShort(s.daysInPension)}
                </span>
              </p>
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1.5 text-xs text-emerald-700 hover:text-emerald-800 font-medium"
                >
                  <MessageCircle className="h-3 w-3" />
                  {labels.contactClient}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
