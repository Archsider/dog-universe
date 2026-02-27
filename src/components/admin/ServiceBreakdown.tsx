'use client';

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ServiceBreakdownProps {
  boardingRevenue: number;
  taxiRevenue: number;
  locale: string;
}

export default function ServiceBreakdown({ boardingRevenue, taxiRevenue, locale }: ServiceBreakdownProps) {
  const labels = {
    fr: { boarding: 'Pension', taxi: 'Taxi Animalier', noData: 'Pas de données' },
    en: { boarding: 'Boarding', taxi: 'Pet Taxi', noData: 'No data' },
  };
  const l = labels[locale as keyof typeof labels] || labels.fr;

  const total = boardingRevenue + taxiRevenue;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">{l.noData}</div>
    );
  }

  const data = [
    { name: l.boarding, value: boardingRevenue },
    { name: l.taxi, value: taxiRevenue },
  ];

  const COLORS = ['#C9A84C', '#2C2C2C'];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => [`${value.toLocaleString()} MAD`]} contentStyle={{ borderRadius: '8px', border: '1px solid #F0D98A' }} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
