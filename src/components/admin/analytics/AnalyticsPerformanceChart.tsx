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
    backgroundColor: '#1a1d27',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: 12,
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={merged} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="agBoarding" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#c9a84c" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="agTaxi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#4a90d9" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4a90d9" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="agGrooming" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="agCroquettes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickFormatter={formatK}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) => [
            `${Math.round(value).toLocaleString()} MAD`,
            labels[name] ?? name,
          ]}
          cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
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

        {/* Ligne pointillée — Période précédente (total) */}
        <Line
          type="monotone"
          dataKey="prevTotal"
          stroke="#6b7280"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 3, fill: '#6b7280' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
