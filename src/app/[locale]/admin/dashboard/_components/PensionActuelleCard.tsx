// Carte "Pension actuelle" — Zone 1.
// Compteurs IN_PROGRESS strict (chiens + chats) avec barre de remplissage
// par espèce et code couleur ≥70/≥90. Click → /admin/calendar.

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { PensionSnapshot } from '../_lib/queries';
import { occupancyLevel, occupancyPercent } from '../_lib/helpers';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  locale: string;
  snapshot: PensionSnapshot;
  labels: DashboardLabels;
}

const TRACK_BG = 'bg-[#F5EAD0]';
const FILL_BY_LEVEL = {
  green: 'bg-emerald-500',
  orange: 'bg-amber-500',
  red: 'bg-red-500',
} as const;

function Bar({
  current,
  limit,
  emoji,
  speciesLabel,
}: {
  current: number;
  limit: number;
  emoji: string;
  speciesLabel: string;
}) {
  const pct = occupancyPercent(current, limit);
  const level = occupancyLevel(pct);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium text-charcoal flex items-center gap-1.5">
          <span aria-hidden="true">{emoji}</span> {speciesLabel}
        </span>
        <span className="text-sm font-semibold text-charcoal tabular-nums">
          {current} / {limit}
        </span>
      </div>
      <div className={`h-2 w-full rounded-full ${TRACK_BG} overflow-hidden`}>
        <div
          className={`h-full ${FILL_BY_LEVEL[level]} transition-[width] duration-500`}
          style={{ width: `${Math.min(100, pct)}%` }}
          aria-label={`${pct}% occupancy`}
        />
      </div>
      <p className={`mt-1 text-xs ${level === 'red' ? 'text-red-600 font-semibold' : level === 'orange' ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
        {pct}%
        {level === 'red' && ' ⚠'}
      </p>
    </div>
  );
}

export function PensionActuelleCard({ locale, snapshot, labels }: Props) {
  return (
    <Link
      href={`/${locale}/admin/calendar`}
      className="group block bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-charcoal text-sm uppercase tracking-wider">
          {labels.pensionNow}
        </h3>
        <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-[#C4974A] transition-colors" />
      </div>
      <div className="space-y-4">
        <Bar
          current={snapshot.dogsIn}
          limit={snapshot.dogsLimit}
          emoji="🐕"
          speciesLabel={labels.dogs}
        />
        <Bar
          current={snapshot.catsIn}
          limit={snapshot.catsLimit}
          emoji="🐈"
          speciesLabel={labels.cats}
        />
      </div>
    </Link>
  );
}
