'use client';

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
  OTHER:    '#6b7280',
} as const;

type ServiceKey = keyof typeof SERVICE_COLORS;

export default function AnalyticsBreakdownDonut({ data, locale }: Props) {
  const isFr = locale === 'fr';

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
      <div className="flex items-center justify-center h-48 text-sm" style={{ color: '#6b7280' }}>
        {isFr ? 'Pas de données ce mois' : 'No data this month'}
      </div>
    );
  }

  const rows: { key: ServiceKey; label: string; value: number }[] = (
    Object.keys(SERVICE_COLORS) as ServiceKey[]
  )
    .map(key => ({ key, label: serviceLabels[key], value: data[key] }))
    .filter(r => r.value > 0);

  const tooltipStyle = {
    backgroundColor: '#1a1d27',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: 12,
  };

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={rows}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={85}
            dataKey="value"
            paddingAngle={3}
          >
            {rows.map(r => (
              <Cell key={r.key} fill={SERVICE_COLORS[r.key]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`${Math.round(value).toLocaleString()} MAD`]}
            contentStyle={tooltipStyle}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="mt-4 space-y-2.5">
        {rows.map(row => (
          <div key={row.key} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: SERVICE_COLORS[row.key] }}
              />
              <span style={{ color: '#d1d5db' }}>{row.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-white">{formatMAD(row.value)}</span>
              <span className="text-xs w-10 text-right" style={{ color: '#6b7280' }}>
                {Math.round((row.value / total) * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
