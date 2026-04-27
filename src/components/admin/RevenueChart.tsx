'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface RevenueDataPoint {
  month: string;
  boarding: number;
  taxi: number;
  grooming?: number;
  croquettes?: number;
}

interface RevenueChartProps {
  data: RevenueDataPoint[];
  locale: string;
}

export default function RevenueChart({ data, locale }: RevenueChartProps) {
  const labels = {
    fr: { boarding: 'Pension', taxi: 'Taxi', grooming: 'Toilettage', croquettes: 'Croquettes', currency: 'MAD' },
    en: { boarding: 'Boarding', taxi: 'Taxi', grooming: 'Grooming', croquettes: 'Croquettes', currency: 'MAD' },
  };
  const l = labels[locale as keyof typeof labels] || labels.fr;

  const formatValue = (value: number) => `${value.toLocaleString()} MAD`;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0EDD8" />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} />
        <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(value, name) => {
            const labelMap: Record<string, string> = {
              boarding: l.boarding,
              taxi: l.taxi,
              grooming: l.grooming,
              croquettes: l.croquettes,
            };
            const numeric = typeof value === 'number' ? value : Number(value ?? 0);
            const key = typeof name === 'string' ? name : String(name ?? '');
            return [formatValue(numeric), labelMap[key] ?? key];
          }}
          contentStyle={{ borderRadius: '8px', border: '1px solid #F0D98A', backgroundColor: '#FFFEF7' }}
        />
        <Legend formatter={(value) => {
          const labelMap: Record<string, string> = {
            boarding: l.boarding,
            taxi: l.taxi,
            grooming: l.grooming,
            croquettes: l.croquettes,
          };
          return labelMap[value] ?? value;
        }} />
        <Bar dataKey="boarding" fill="#C9A84C" radius={[4, 4, 0, 0]} />
        <Bar dataKey="taxi" fill="#2C2C2C" radius={[4, 4, 0, 0]} />
        <Bar dataKey="grooming" fill="#7C9D8E" radius={[4, 4, 0, 0]} />
        <Bar dataKey="croquettes" fill="#E8A838" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
