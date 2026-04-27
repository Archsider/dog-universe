'use client';

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DataPoint {
  month: string;
  boarding: number;
  grooming: number;
  taxi: number;
  croquettes: number;
  total: number;
}

interface LastYearPoint {
  month: string;
  total: number;
}

interface Props {
  data: DataPoint[];
  lastYearData: LastYearPoint[];
  locale: string;
}

type MergedPoint = DataPoint & { prevTotal: number };

export default function AnalyticsPerformanceChart({ data, lastYearData, locale }: Props) {
  const isFr = locale === 'fr';

  const merged: MergedPoint[] = data.map((d, i) => ({
    ...d,
    prevTotal: lastYearData[i]?.total ?? 0,
  }));

  const labels: Record<string, string> = {
    boarding:   isFr ? 'Pension' : 'Boarding',
    taxi:       'Taxi',
    grooming:   isFr ? 'Toilettage' : 'Grooming',
    croquettes: 'Croquettes',
    prevTotal:  isFr ? 'Année préc.' : 'Prev. year',
  };

  const formatK = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v));

  const tooltipStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '8px',
    color: '#374151',
    fontSize: 12,
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08)',
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={merged} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="agBoarding" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#c9a84c" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="agTaxi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#4a90d9" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#4a90d9" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="agGrooming" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="agCroquettes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickFormatter={formatK}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => {
            const numeric = typeof value === 'number' ? value : Number(value ?? 0);
            const key = typeof name === 'string' ? name : String(name ?? '');
            return [
              `${Math.round(numeric).toLocaleString()} MAD`,
              labels[key] ?? key,
            ];
          }}
          cursor={{ stroke: 'rgba(0,0,0,0.08)', strokeWidth: 1 }}
        />

        <Area
          type="monotone"
          dataKey="boarding"
          stroke="#c9a84c"
          strokeWidth={2}
          fill="url(#agBoarding)"
          dot={false}
          activeDot={{ r: 4, fill: '#c9a84c' }}
        />
        <Area
          type="monotone"
          dataKey="taxi"
          stroke="#4a90d9"
          strokeWidth={2}
          fill="url(#agTaxi)"
          dot={false}
          activeDot={{ r: 4, fill: '#4a90d9' }}
        />
        <Area
          type="monotone"
          dataKey="grooming"
          stroke="#8b5cf6"
          strokeWidth={2}
          fill="url(#agGrooming)"
          dot={false}
          activeDot={{ r: 4, fill: '#8b5cf6' }}
        />
        <Area
          type="monotone"
          dataKey="croquettes"
          stroke="#f59e0b"
          strokeWidth={2}
          fill="url(#agCroquettes)"
          dot={false}
          activeDot={{ r: 4, fill: '#f59e0b' }}
        />

        <Line
          type="monotone"
          dataKey="prevTotal"
          stroke="#9ca3af"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 3, fill: '#9ca3af' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
