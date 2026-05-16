// Anomalies critiques (invariants comptables) — Zone 3.
// Affiché UNIQUEMENT si > 0 invariant critique. Lien direct vers le
// dashboard détaillé.

import Link from 'next/link';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import type { CriticalInvariantHit } from '../_lib/queries';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  locale: string;
  hits: CriticalInvariantHit[];
  labels: DashboardLabels;
}

export function CriticalInvariantsCard({ locale, hits, labels }: Props) {
  if (hits.length === 0) return null;
  return (
    <div className="bg-red-50 rounded-xl border border-red-200 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <h3 className="font-semibold text-red-800 text-sm uppercase tracking-wider">
          {labels.invariantsTitle}
        </h3>
      </div>
      <p className="text-sm text-red-700 mb-3">{labels.invariantsCount(hits.length)}</p>
      <ul className="space-y-1 mb-3">
        {hits.slice(0, 3).map((h) => (
          <li key={h.key} className="text-xs text-red-700">
            • {h.label} <span className="text-red-500">({h.count})</span>
          </li>
        ))}
      </ul>
      <Link
        href={`/${locale}/admin/guardian/invariants`}
        className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-900"
      >
        {labels.viewInvariants}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
