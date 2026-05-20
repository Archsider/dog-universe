// Carte "À valider maintenant" — Zone 1.
// Affiche le compteur PENDING. Si > 0 : CTA. Si 0 : empty state vert pâle.

import Link from 'next/link';
import { CheckCircle2, Bell } from 'lucide-react';
import type { PendingSnapshot } from '../_lib/queries';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  locale: string;
  snapshot: PendingSnapshot;
  labels: DashboardLabels;
}

export function AValiderCard({ locale, snapshot, labels }: Props) {
  const { count } = snapshot;
  if (count === 0) {
    return (
      <div className="bg-white rounded-xl border border-emerald-200/60 p-5 shadow-card">
        <div className="flex flex-col items-center justify-center text-center py-4">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="font-semibold text-emerald-700 text-sm">{labels.allValidated}</p>
          <p className="text-xs text-gray-500 mt-1">{labels.allValidatedSub}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-amber-200/60 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal text-sm uppercase tracking-wider mb-4">
        {labels.pendingNow}
      </h3>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
          <Bell className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="text-3xl font-bold text-amber-700 tabular-nums leading-none">{count}</p>
          <p className="text-xs text-amber-600 mt-1">
            {count === 1 ? 'réservation' : 'réservations'} en attente
          </p>
        </div>
      </div>
      {/* Deep-link to the Today tab + anchor on the pending section so the
          admin lands directly on the inline Refuser/Valider list — not on
          the full reservations table mixed with confirmed/past stays. */}
      <Link
        href={`/${locale}/admin/reservations?view=today#pending`}
        className="block w-full text-center px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
      >
        {labels.pendingCta(count)}
      </Link>
    </div>
  );
}
