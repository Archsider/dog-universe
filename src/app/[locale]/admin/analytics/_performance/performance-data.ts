// Data loader for <PerformanceDashboard /> — composes EXISTING, tested
// metrics helpers (no new raw query). Single revenue source = cashByMonth
// so that Σ(categories) === total by construction (MonthlyEntry.total is
// the sum of its category buckets) — the brief's coherence criterion is
// free. KPIs reuse avgBasket / newClientsCount / volumeByCategory /
// deltaPercent. All Casa-anchored via the caller-supplied year/month.

import { cashByMonth, type MonthlyEntry } from '@/lib/metrics/revenue';
import { avgBasket, newClientsCount, volumeByCategory, deltaPercent } from '@/lib/metrics/operations';
import { startOfMonthCasa, endOfMonthCasa } from '@/lib/dates-casablanca';

export interface PerfKpi {
  value: number;
  unit: 'MAD' | 'count';
  delta: number | null; // % vs previous month, null if previous = 0
}

export interface PerfCategory {
  key: 'boarding' | 'croquettes' | 'taxi' | 'grooming';
  label: string;
  color: string;
  revenue: number;
  count: number;
  percentage: number; // 0-100 of month total
}

export interface PerfMonthPoint {
  month: number; // 0-11
  label: string; // "Jan", "Fév"…
  total: number;
}

export interface PerformanceData {
  year: number;
  month: number; // 1-12
  monthLabel: string; // "Mai 2026"
  kpis: {
    revenue: PerfKpi;
    avgBasket: PerfKpi;
    newFamilies: PerfKpi;
    services: PerfKpi;
  };
  categories: PerfCategory[];
  monthlySeries: PerfMonthPoint[]; // 12 points for the chart
  hasData: boolean;
}

const MONTH_LABELS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const MONTH_FULL_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// Brand palette — bronze gold dominant, then distinct warm/cool accents so
// the four categories stay legible (the old palette was 3 greys → washed out).
const CAT_META: { key: PerfCategory['key']; labelFr: string; color: string }[] = [
  { key: 'boarding', labelFr: 'Pension', color: '#B8842D' },     // bronze gold
  { key: 'croquettes', labelFr: 'Croquettes', color: '#C25E3A' },// terracotta
  { key: 'taxi', labelFr: 'Taxi', color: '#3E7CB1' },            // deep blue
  { key: 'grooming', labelFr: 'Toilettage', color: '#8A6BA3' },  // muted purple
];

function monthEntry(rows: MonthlyEntry[], monthIndex0: number): MonthlyEntry {
  return (
    rows.find((r) => r.month === monthIndex0) ?? {
      month: monthIndex0, total: 0, boarding: 0, taxi: 0, grooming: 0, croquettes: 0,
    }
  );
}

/**
 * @param year  Casa-anchored calendar year
 * @param month Casa-anchored month 1-12
 */
export async function getPerformanceData(year: number, month: number): Promise<PerformanceData> {
  const m0 = month - 1; // 0-based for MonthlyEntry / labels
  const prevM0 = (m0 + 11) % 12;
  const prevYear = m0 === 0 ? year - 1 : year;

  const monthStart = startOfMonthCasa(new Date(Date.UTC(year, m0, 15)));
  const monthEnd = endOfMonthCasa(new Date(Date.UTC(year, m0, 15)));

  const [thisYearSeries, prevYearSeries, basket, prevBasketEntryYear, families, volumes] = await Promise.all([
    cashByMonth(year),
    m0 === 0 ? cashByMonth(year - 1) : Promise.resolve<MonthlyEntry[]>([]),
    avgBasket(monthStart, monthEnd),
    // For the avgBasket delta we need the previous month's basket — compute
    // its window. (Cheap : one extra aggregate.)
    (async () => {
      const pStart = startOfMonthCasa(new Date(Date.UTC(prevYear, prevM0, 15)));
      const pEnd = endOfMonthCasa(new Date(Date.UTC(prevYear, prevM0, 15)));
      return avgBasket(pStart, pEnd);
    })(),
    newClientsCount(monthStart, monthEnd, true),
    volumeByCategory(monthStart, monthEnd),
  ]);

  const cur = monthEntry(thisYearSeries, m0);
  const prev = m0 === 0 ? monthEntry(prevYearSeries, 11) : monthEntry(thisYearSeries, prevM0);

  // Previous-month families (for delta).
  const pStart = startOfMonthCasa(new Date(Date.UTC(prevYear, prevM0, 15)));
  const pEnd = endOfMonthCasa(new Date(Date.UTC(prevYear, prevM0, 15)));
  const [prevFamilies, prevVolumes] = await Promise.all([
    newClientsCount(pStart, pEnd, true),
    volumeByCategory(pStart, pEnd),
  ]);

  const servicesCount = volumes.boarding + volumes.taxi + volumes.grooming + volumes.croquettes;
  const prevServicesCount = prevVolumes.boarding + prevVolumes.taxi + prevVolumes.grooming + prevVolumes.croquettes;

  const total = cur.total;
  const categories: PerfCategory[] = CAT_META.map((meta) => {
    const revenue = cur[meta.key];
    const count =
      meta.key === 'boarding' ? volumes.boarding
      : meta.key === 'taxi' ? volumes.taxi
      : meta.key === 'grooming' ? volumes.grooming
      : volumes.croquettes;
    return {
      key: meta.key,
      label: meta.labelFr,
      color: meta.color,
      revenue,
      count,
      percentage: total > 0 ? Math.round((revenue / total) * 100) : 0,
    };
  })
    .filter((c) => c.revenue > 0 || c.count > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const monthlySeries: PerfMonthPoint[] = thisYearSeries
    .map((e) => ({ month: e.month, label: MONTH_LABELS_FR[e.month] ?? String(e.month + 1), total: e.total }))
    .sort((a, b) => a.month - b.month);

  const delta = (c: number, p: number): number | null => (p === 0 ? null : deltaPercent(c, p));

  return {
    year,
    month,
    monthLabel: `${MONTH_FULL_FR[m0]} ${year}`,
    kpis: {
      revenue:     { value: total, unit: 'MAD', delta: delta(total, prev.total) },
      avgBasket:   { value: basket, unit: 'MAD', delta: delta(basket, prevBasketEntryYear) },
      newFamilies: { value: families, unit: 'count', delta: delta(families, prevFamilies) },
      services:    { value: servicesCount, unit: 'count', delta: delta(servicesCount, prevServicesCount) },
    },
    categories,
    monthlySeries,
    hasData: total > 0 || servicesCount > 0 || families > 0,
  };
}
