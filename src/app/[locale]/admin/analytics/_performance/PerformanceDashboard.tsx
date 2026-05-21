'use client';

// <PerformanceDashboard /> — classe-mondiale performance block for
// /admin/analytics. KPI strip → 12-month revenue chart → category
// breakdown. Pattern : Stripe / Linear. All numbers tabular-nums, single
// bronze accent, green/red reserved for deltas only.
//
// Data is fetched server-side (getPerformanceData) and passed in — this
// component is pure presentation + the Recharts client island.

import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import type { PerformanceData, PerfKpi } from './performance-data';

const ACCENT = '#B8842D';

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || Math.abs(delta) < 0.05) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
        <Minus className="h-3 w-3" /> —
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${
        up ? 'text-emerald-600' : 'text-rose-600'
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{delta.toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, kpi }: { label: string; kpi: PerfKpi }) {
  const display = kpi.unit === 'MAD' ? formatMAD(kpi.value) : kpi.value.toLocaleString('fr-FR');
  return (
    <div className="rounded-xl border border-[#E2C048]/30 bg-white p-3.5">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-medium tracking-tight text-charcoal tabular-nums">{display}</p>
      <div className="mt-1.5"><DeltaBadge delta={kpi.delta} /></div>
    </div>
  );
}

interface Props {
  fr: boolean;
  data: PerformanceData;
}

export default function PerformanceDashboard({ fr, data }: Props) {
  const { kpis, categories, monthlySeries, monthLabel } = data;

  const chartData = useMemo(
    () => monthlySeries.map((p) => ({ name: p.label, value: Math.round(p.total) })),
    [monthlySeries],
  );

  const totalServices = categories.reduce((s, c) => s + c.count, 0);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-medium text-charcoal">{fr ? 'Performance' : 'Performance'}</h2>
        <p className="text-xs text-gray-500">
          Dog Universe Marrakech · <span className="capitalize">{monthLabel}</span>
        </p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KpiCard label={fr ? 'Revenus du mois' : 'Monthly revenue'} kpi={kpis.revenue} />
        <KpiCard label={fr ? 'Panier moyen' : 'Average basket'} kpi={kpis.avgBasket} />
        <KpiCard label={fr ? 'Prestations' : 'Services'} kpi={kpis.services} />
        <KpiCard label={fr ? 'Nouvelles familles' : 'New families'} kpi={kpis.newFamilies} />
      </div>

      {/* Revenue chart — 12 months */}
      <div className="rounded-xl border border-[#E2C048]/30 bg-white p-4">
        <p className="text-xs text-gray-500 mb-3">{fr ? 'Évolution des revenus · 12 mois' : 'Revenue evolution · 12 months'}</p>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
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
      </div>

      {/* Category breakdown */}
      <div className="rounded-xl border border-[#E2C048]/30 bg-white p-4">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-xs text-gray-500">{fr ? 'Détail par catégorie' : 'By category'}</p>
          <p className="text-[11px] text-gray-400 tabular-nums">
            {totalServices} {fr ? 'prestations' : 'services'}
          </p>
        </div>
        {categories.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            {fr ? 'Aucune donnée pour ce mois.' : 'No data for this month.'}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {categories.map((c) => (
              <li key={c.key} className="flex items-center gap-3 text-sm">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} aria-hidden />
                <span className="w-24 shrink-0 text-charcoal">{c.label}</span>
                <span className="w-20 shrink-0 text-[11px] text-gray-400 tabular-nums">
                  {c.count} {fr ? 'u.' : 'u.'}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${c.percentage}%`, backgroundColor: c.color }} />
                </div>
                <span className="w-24 shrink-0 text-right font-medium text-charcoal tabular-nums">{formatMAD(c.revenue)}</span>
                <span className="w-10 shrink-0 text-right text-[11px] text-gray-400 tabular-nums">{c.percentage}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
