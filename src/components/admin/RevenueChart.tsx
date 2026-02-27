'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface RevenueDataPoint {
  month: string;
  boarding: number;
  taxi: number;
}

interface RevenueChartProps {
  data: RevenueDataPoint[];
  locale: string;
}

export default function RevenueChart({ data, locale }: RevenueChartProps) {
  const labels = {
    fr: { boarding: 'Pension', taxi: 'Taxi', currency: 'MAD' },
    en: { boarding: 'Boarding', taxi: 'Taxi', currency: 'MAD' },
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
          formatter={(value: number, name: string) => [formatValue(value), name === 'boarding' ? l.boarding : l.taxi]}
          contentStyle={{ borderRadius: '8px', border: '1px solid #F0D98A', backgroundColor: '#FFFEF7' }}
        />
        <Legend formatter={(value) => value === 'boarding' ? l.boarding : l.taxi} />
        <Bar dataKey="boarding" fill="#C9A84C" radius={[4, 4, 0, 0]} />
        <Bar dataKey="taxi" fill="#2C2C2C" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
