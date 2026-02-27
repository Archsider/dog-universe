'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMAD } from '@/lib/utils';

interface ServiceBreakdownProps {
  boardingRevenue: number;
  taxiRevenue: number;
  groomingRevenue: number;
  locale: string;
}

const COLORS = ['#C9A84C', '#2C2C2C', '#7C9D8E'];

export default function ServiceBreakdown({ boardingRevenue, taxiRevenue, groomingRevenue, locale }: ServiceBreakdownProps) {
  const labels = {
    fr: { boarding: 'Pension', taxi: 'Taxi animalier', grooming: 'Toilettage', noData: 'Pas de données' },
    en: { boarding: 'Boarding', taxi: 'Pet Taxi', grooming: 'Grooming', noData: 'No data' },
  };
  const l = labels[locale as keyof typeof labels] || labels.fr;

  const total = boardingRevenue + taxiRevenue + groomingRevenue;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">{l.noData}</div>
    );
  }

  const data = [
    { name: l.boarding, value: boardingRevenue },
    { name: l.taxi, value: taxiRevenue },
    { name: l.grooming, value: groomingRevenue },
  ].filter(d => d.value > 0);

  const rows = [
    { name: l.boarding, value: boardingRevenue, color: COLORS[0] },
    { name: l.taxi, value: taxiRevenue, color: COLORS[1] },
    { name: l.grooming, value: groomingRevenue, color: COLORS[2] },
  ];

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`${value.toLocaleString()} MAD`]}
            contentStyle={{ borderRadius: '8px', border: '1px solid #F0D98A', backgroundColor: '#FFFEF7' }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Breakdown list */}
      <div className="mt-3 space-y-2">
        {rows.map(row => (
          <div key={row.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
              <span className="text-charcoal/70">{row.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-charcoal">{formatMAD(row.value)}</span>
              <span className="text-xs text-gray-400 w-10 text-right">
                {total > 0 ? `${Math.round((row.value / total) * 100)}%` : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
