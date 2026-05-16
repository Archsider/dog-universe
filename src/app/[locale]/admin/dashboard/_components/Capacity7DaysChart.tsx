// Capacité 7 jours — Zone 2.
// Deux mini-graphs côte à côte (chiens + chats), 7 barres chacun.
// Pure inline SVG — pas de Recharts pour rester ultra-léger sur mobile.

import type { SevenDayCapacitySnapshot } from '../_lib/queries';
import { occupancyLevel, occupancyPercent, type OccupancyLevel } from '../_lib/helpers';
import type { DashboardLabels } from '../_lib/labels';

interface Props {
  snapshot: SevenDayCapacitySnapshot;
  labels: DashboardLabels;
}

const BAR_BG = '#F5EAD0';
const FILL_HEX: Record<OccupancyLevel, string> = {
  green: '#10b981',
  orange: '#f59e0b',
  red: '#ef4444',
};
const DOT_BY_LEVEL: Record<OccupancyLevel, string> = {
  green: '',
  orange: '🟠',
  red: '🔴',
};

interface SpeciesChartProps {
  emoji: string;
  speciesLabel: string;
  series: Array<{ pct: number; label: string; sublabel: string; key: string }>;
}

function SpeciesChart({ emoji, speciesLabel, series }: SpeciesChartProps) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-charcoal mb-3 flex items-center gap-1.5">
        <span aria-hidden="true">{emoji}</span> {speciesLabel}
      </h4>
      <div className="flex items-end gap-1.5 h-32">
        {series.map((d) => {
          const level = occupancyLevel(d.pct);
          const fill = FILL_HEX[level];
          const heightPct = Math.max(4, Math.min(100, d.pct));
          return (
            <div key={d.key} className="flex-1 flex flex-col items-center justify-end h-full">
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: fill,
                }}
                aria-label={`${d.label} ${d.pct}%`}
              />
              <div className="w-full h-px" style={{ backgroundColor: BAR_BG }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-2">
        {series.map((d) => (
          <div key={d.key} className="flex-1 text-center">
            <p className="text-[10px] font-medium text-charcoal">{d.label}</p>
            <p className="text-[10px] text-gray-500">{d.sublabel}</p>
            <p className="text-[10px] tabular-nums text-charcoal">{d.pct}%</p>
            <p className="text-[10px]" aria-hidden="true">{DOT_BY_LEVEL[occupancyLevel(d.pct)] || ' '}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Capacity7DaysChart({ snapshot, labels }: Props) {
  const { days, dogsLimit, catsLimit } = snapshot;
  const dogsSeries = days.map((d) => ({
    key: `dog-${d.ymd}`,
    pct: occupancyPercent(d.dogsCount, dogsLimit),
    label: d.weekdayShortFr,
    sublabel: String(d.dayOfMonth),
  }));
  const catsSeries = days.map((d) => ({
    key: `cat-${d.ymd}`,
    pct: occupancyPercent(d.catsCount, catsLimit),
    label: d.weekdayShortFr,
    sublabel: String(d.dayOfMonth),
  }));

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal text-sm uppercase tracking-wider mb-4">
        {labels.capacity7d}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SpeciesChart emoji="🐕" speciesLabel={labels.dogs} series={dogsSeries} />
        <SpeciesChart emoji="🐈" speciesLabel={labels.cats} series={catsSeries} />
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-[#F0D98A]/30 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: FILL_HEX.red }} /> {labels.capacityLegendRed}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: FILL_HEX.orange }} /> {labels.capacityLegendOrange}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: FILL_HEX.green }} /> {labels.capacityLegendGreen}</span>
      </div>
    </div>
  );
}
