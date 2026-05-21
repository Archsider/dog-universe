'use client';

// <PerformanceDashboard /> — classe-mondiale performance block for
// /admin/analytics. KPI strip → 12-month revenue chart → category
// breakdown (clickable → drill-down to the invoices that compose it).
// Pattern : Stripe / Linear. All numbers tabular-nums, single bronze
// accent, green/red reserved for deltas only.
//
// Data is fetched server-side (getPerformanceData + per-item drill list)
// and passed in — this component is pure presentation + the Recharts
// client island.

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import type { PerformanceData, PerfKpi, PerfCategory } from './performance-data';

// Recharts is NOT server-render-safe in this codebase — load the chart
// island client-only (ssr: false), exactly like AnalyticsCharts. A static
// recharts import here crashed /admin/analytics on SSR (digest error).
const PerformanceRevenueChart = dynamic(() => import('./PerformanceRevenueChart'), {
  ssr: false,
  loading: () => <div className="h-[200px] w-full rounded-lg bg-gray-50 animate-pulse" />,
});

// Per-item drill row — mirrors the server builder in page.tsx. `amount` is
// the cash collected THIS month for that line (sequential Payment → item
// allocation), not quantity × unitPrice.
interface CategoryItem {
  description: string;
  quantity: number;
  unitPrice: number;
  category: 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT';
  invoice: {
    invoiceNumber: string;
    issuedAt: Date | string;
    clientDisplayName: string | null;
    client: { name: string } | null;
  };
  amount: number;
  paymentDate: Date | string | null;
}

// PerfCategory.key (boarding/croquettes/taxi/grooming) → InvoiceItem.category.
const DRILL_KEY: Record<PerfCategory['key'], CategoryItem['category']> = {
  boarding: 'BOARDING',
  croquettes: 'PRODUCT',
  taxi: 'PET_TAXI',
  grooming: 'GROOMING',
};

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
    <div className="rounded-xl border border-[#E2C048]/30 bg-white p-3.5 shadow-card">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-medium tracking-tight text-charcoal tabular-nums">{display}</p>
      <div className="mt-1.5"><DeltaBadge delta={kpi.delta} /></div>
    </div>
  );
}

function fmtDate(d: Date | string): string {
  const date = new Date(d);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

interface Props {
  fr: boolean;
  data: PerformanceData;
  categoryItems: CategoryItem[];
}

export default function PerformanceDashboard({ fr, data, categoryItems }: Props) {
  const { kpis, categories, monthlySeries, monthLabel } = data;
  const [active, setActive] = useState<PerfCategory['key'] | null>(null);

  const chartData = useMemo(
    () => monthlySeries.map((p) => ({ name: p.label, value: Math.round(p.total) })),
    [monthlySeries],
  );

  const totalServices = categories.reduce((s, c) => s + c.count, 0);

  const activeItems = useMemo(() => {
    if (!active) return [];
    const cat = DRILL_KEY[active];
    return categoryItems.filter((it) => it.category === cat);
  }, [active, categoryItems]);
  const activeLabel = active ? categories.find((c) => c.key === active)?.label ?? '' : '';

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-medium text-charcoal">{fr ? 'Performance' : 'Performance'}</h2>
        <p className="text-xs text-gray-500">
          Dog Universe Marrakech · <span className="capitalize">{monthLabel}</span>
        </p>
      </header>

      {/* KPI — hero revenue + 3 secondary metrics */}
      <div className="grid gap-2.5 lg:grid-cols-4">
        <div className="rounded-xl border border-[#B8842D]/40 bg-gradient-to-br from-[#FBF6EA] to-white p-4 shadow-card">
          <p className="text-[11px] text-[#9A7235]">{fr ? 'Revenus du mois' : 'Monthly revenue'}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-charcoal tabular-nums">{formatMAD(kpis.revenue.value)}</p>
          <div className="mt-2"><DeltaBadge delta={kpis.revenue.delta} /></div>
        </div>
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <KpiCard label={fr ? 'Panier moyen' : 'Average basket'} kpi={kpis.avgBasket} />
          <KpiCard label={fr ? 'Prestations' : 'Services'} kpi={kpis.services} />
          <KpiCard label={fr ? 'Nouvelles familles' : 'New families'} kpi={kpis.newFamilies} />
        </div>
      </div>

      {/* Revenue chart — 12 months (client-only recharts island) */}
      <div className="rounded-xl border border-[#E2C048]/30 bg-white p-4 shadow-card">
        <p className="text-xs text-gray-500 mb-3">{fr ? 'Évolution des revenus · 12 mois' : 'Revenue evolution · 12 months'}</p>
        <PerformanceRevenueChart fr={fr} data={chartData} />
      </div>

      {/* Category breakdown — rows are clickable → drill-down to invoices */}
      <div className="rounded-xl border border-[#E2C048]/30 bg-white p-4 shadow-card">
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
          <ul className="space-y-1">
            {categories.map((c) => {
              const isActive = active === c.key;
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setActive((prev) => (prev === c.key ? null : c.key))}
                    className={`w-full flex items-center gap-3 text-sm rounded-lg px-2 py-1.5 transition-colors ${
                      isActive ? 'bg-[#E2C048]/10' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} aria-hidden />
                    <span className="w-24 shrink-0 text-left text-charcoal">{c.label}</span>
                    <span className="w-20 shrink-0 text-left text-[11px] text-gray-400 tabular-nums">
                      {c.count} {fr ? 'u.' : 'u.'}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${c.percentage}%`, backgroundColor: c.color }} />
                    </div>
                    <span className="w-24 shrink-0 text-right font-medium text-charcoal tabular-nums">{formatMAD(c.revenue)}</span>
                    <span className="w-10 shrink-0 text-right text-[11px] text-gray-400 tabular-nums">{c.percentage}%</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Drill-down table — invoices that compose the active category */}
        {active && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-charcoal">
                {fr ? 'Détail' : 'Details'} — {activeLabel}
                <span className="ml-2 text-[11px] text-gray-400 tabular-nums">{activeItems.length}</span>
              </p>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="text-[11px] text-gray-400 hover:text-charcoal"
              >
                {fr ? 'Fermer' : 'Close'} ✕
              </button>
            </div>
            {activeItems.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 text-center">
                {fr ? 'Aucun encaissement pour cette catégorie ce mois.' : 'No collections for this category this month.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="text-left font-medium px-2 py-1.5">{fr ? 'Facture' : 'Invoice'}</th>
                      <th className="text-left font-medium px-2 py-1.5">{fr ? 'Client' : 'Client'}</th>
                      <th className="text-left font-medium px-2 py-1.5">{fr ? 'Paiement' : 'Payment'}</th>
                      <th className="text-left font-medium px-2 py-1.5">{fr ? 'Description' : 'Description'}</th>
                      <th className="text-right font-medium px-2 py-1.5">{fr ? 'Encaissé' : 'Collected'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeItems.map((it, i) => {
                      const clientName =
                        it.invoice.clientDisplayName ??
                        it.invoice.client?.name ??
                        (fr ? 'Client de passage' : 'Walk-in client');
                      return (
                        <tr key={`${it.invoice.invoiceNumber}-${i}`} className="border-t border-gray-50">
                          <td className="px-2 py-1.5 font-mono text-xs font-medium text-[#9A7235]">{it.invoice.invoiceNumber}</td>
                          <td className="px-2 py-1.5 text-charcoal">{clientName}</td>
                          <td className="px-2 py-1.5 text-gray-500 tabular-nums">{it.paymentDate ? fmtDate(it.paymentDate) : '—'}</td>
                          <td className="px-2 py-1.5 text-charcoal">{it.description}</td>
                          <td className="px-2 py-1.5 text-right font-medium text-charcoal tabular-nums">{formatMAD(it.amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
