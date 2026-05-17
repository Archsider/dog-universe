'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMAD } from '@/lib/utils';

interface Props {
  data: { BOARDING: number; PET_TAXI: number; GROOMING: number; PRODUCT: number; OTHER: number };
  locale: string;
}

const SERVICE_COLORS = {
  BOARDING: '#c9a84c',
  PET_TAXI: '#4a90d9',
  GROOMING: '#8b5cf6',
  PRODUCT:  '#f59e0b',
  OTHER:    '#9ca3af',
} as const;

type ServiceKey = keyof typeof SERVICE_COLORS;

// Order canonique pour affichage légende (gros activités d'abord).
const DISPLAY_ORDER: ServiceKey[] = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER'];

export default function AnalyticsBreakdownDonut({ data, locale }: Props) {
  const isFr = locale === 'fr';
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const serviceLabels: Record<ServiceKey, string> = {
    BOARDING: isFr ? 'Pension'    : 'Boarding',
    PET_TAXI: 'Taxi',
    GROOMING: isFr ? 'Toilettage' : 'Grooming',
    PRODUCT:  'Croquettes',
    OTHER:    isFr ? 'Divers'     : 'Other',
  };

  const total = data.BOARDING + data.PET_TAXI + data.GROOMING + data.PRODUCT + data.OTHER;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        {isFr ? 'Pas de données ce mois' : 'No data this month'}
      </div>
    );
  }

  const rows: { key: ServiceKey; label: string; value: number; pct: number }[] = DISPLAY_ORDER
    .map(key => ({
      key,
      label: serviceLabels[key],
      value: data[key],
      pct: total > 0 ? (data[key] / total) * 100 : 0,
    }))
    .filter(r => r.value > 0);

  const tooltipStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '8px',
    color: '#374151',
    fontSize: 12,
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
    padding: '8px 10px',
  };

  // Catégorie dominante affichée au centre du donut quand idle.
  const dominant = rows.reduce(
    (best, r) => (r.value > best.value ? r : best),
    rows[0],
  );
  const focused = activeIndex !== null && activeIndex < rows.length ? rows[activeIndex] : dominant;

  return (
    <div className="w-full">
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={rows}
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={88}
              dataKey="value"
              paddingAngle={3}
              stroke="none"
              onMouseEnter={(_, idx) => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {rows.map((r, i) => (
                <Cell
                  key={r.key}
                  fill={SERVICE_COLORS[r.key]}
                  opacity={activeIndex === null || activeIndex === i ? 1 : 0.45}
                  style={{ transition: 'opacity 200ms ease-out' }}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => {
                const numeric = typeof value === 'number' ? value : Number(value ?? 0);
                const pct = total > 0 ? Math.round((numeric / total) * 100) : 0;
                const label = item?.payload?.label ?? '';
                return [`${formatMAD(numeric)} · ${pct}%`, label];
              }}
              contentStyle={tooltipStyle}
              cursor={false}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Centre du donut — total ou catégorie focus */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-400">
              {activeIndex === null
                ? (isFr ? 'Total mois' : 'Month total')
                : focused.label}
            </div>
            <div className="text-base font-bold text-charcoal mt-0.5">
              {formatMAD(activeIndex === null ? total : focused.value)}
            </div>
            {activeIndex !== null && (
              <div className="text-[10px] text-gray-400 mt-0.5">
                {Math.round(focused.pct)}%
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {rows.map((row, i) => {
          const active = activeIndex === i;
          return (
            <button
              key={row.key}
              type="button"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              className={`w-full flex items-center justify-between text-sm rounded-md px-1.5 py-1 transition-colors ${
                active ? 'bg-gray-50' : 'bg-transparent'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: SERVICE_COLORS[row.key] }}
                  aria-hidden
                />
                <span className="text-gray-700 truncate">{row.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold text-charcoal">{formatMAD(row.value)}</span>
                <span className="text-xs w-10 text-right text-gray-400">
                  {Math.round(row.pct)}%
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
