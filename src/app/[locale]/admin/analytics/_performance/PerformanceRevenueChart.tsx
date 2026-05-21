'use client';

// Recharts island for PerformanceDashboard. MUST be loaded via
// next/dynamic({ ssr: false }) by the parent — recharts is not
// server-render-safe in this codebase (same pattern as AnalyticsCharts).
// Importing it statically into an SSR'd component crashes the route.

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { formatMAD } from '@/lib/utils';

const ACCENT = '#B8842D';

interface Props {
  fr: boolean;
  data: { name: string; value: number }[];
}

export default function PerformanceRevenueChart({ fr, data }: Props) {
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="perfRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.18} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#00000008" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#888780' }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 10, fill: '#888780' }} axisLine={false} tickLine={false} width={48}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            formatter={(v) => [formatMAD(Number(v) || 0), fr ? 'Revenus' : 'Revenue']}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2C04840' }}
            labelStyle={{ color: '#5F5E5A' }}
          />
          <Area type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={1.75} fill="url(#perfRev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
