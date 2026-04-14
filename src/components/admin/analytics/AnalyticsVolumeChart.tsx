'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  data: { boarding: number; taxi: number; grooming: number; croquettes: number };
  locale: string;
}

const COLORS = {
  boarding:   '#c9a84c',
  taxi:       '#4a90d9',
  grooming:   '#8b5cf6',
  croquettes: '#f59e0b',
} as const;

type ServiceKey = keyof typeof COLORS;

export default function AnalyticsVolumeChart({ data, locale }: Props) {
  const isFr = locale === 'fr';

  const serviceLabels: Record<ServiceKey, { name: string; sub: string }> = {
    boarding:   { name: isFr ? 'Pension'    : 'Boarding', sub: isFr ? 'séjours'  : 'stays'    },
    taxi:       { name: 'Taxi',                             sub: isFr ? 'courses'  : 'rides'    },
    grooming:   { name: isFr ? 'Toilettage' : 'Grooming', sub: isFr ? 'soins'    : 'sessions' },
    croquettes: { name: 'Croquettes',                       sub: isFr ? 'ventes'   : 'sales'    },
  };

  const chartData = (Object.keys(COLORS) as ServiceKey[])
    .map(key => ({
      key,
      name:  serviceLabels[key].name,
      sub:   serviceLabels[key].sub,
      value: data[key],
    }))
    .filter(d => d.value > 0);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm" style={{ color: '#6b7280' }}>
        {isFr ? 'Pas de données ce mois' : 'No data this month'}
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: '#1a1d27',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: 12,
  };

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
        barSize={14}
      >
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12, fill: '#d1d5db' }}
          axisLine={false}
          tickLine={false}
          width={82}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, _name: string, props: { payload?: { sub?: string } }) => [
            `${value} ${props.payload?.sub ?? ''}`,
            '',
          ]}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {chartData.map(entry => (
            <Cell key={entry.key} fill={COLORS[entry.key]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
