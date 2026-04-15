'use client';

import dynamic from 'next/dynamic';
import { formatMAD } from '@/lib/utils';

const AnalyticsPerformanceChart = dynamic(
  () => import('@/components/admin/analytics/AnalyticsPerformanceChart'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] flex items-center justify-center text-sm text-gray-400">
        Chargement...
      </div>
    ),
  },
);

const AnalyticsVolumeChart = dynamic(
  () => import('@/components/admin/analytics/AnalyticsVolumeChart'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
        Chargement...
      </div>
    ),
  },
);

const AnalyticsBreakdownDonut = dynamic(
  () => import('@/components/admin/analytics/AnalyticsBreakdownDonut'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
        Chargement...
      </div>
    ),
  },
);

export interface ServiceKpi {
  thisAmt: number;
  lastAmt: number;
  delta: number;
  count: number;
}

export interface Props {
  serviceKpis: {
    boarding:   ServiceKpi;
    taxi:       ServiceKpi;
    grooming:   ServiceKpi;
    croquettes: ServiceKpi;
  };
  yearlyData: {
    month: string;
    boarding: number;
    grooming: number;
    taxi: number;
    croquettes: number;
    total: number;
  }[];
  lastYearData: { month: string; total: number }[];
  donutData: { BOARDING: number; PET_TAXI: number; GROOMING: number; PRODUCT: number; OTHER: number };
  volumeData: { boarding: number; taxi: number; grooming: number; croquettes: number };
  avgBasket: number;
  avgNights: number;
  newClients: number;
  totalCA: number;
  totalDelta: number;
  locale: string;
  currentYear: number;
}

// Couleurs pour les graphiques Recharts (inchangé)
const CHART_COLORS = {
  boarding:   '#c9a84c',
  taxi:       '#4a90d9',
  grooming:   '#8b5cf6',
  croquettes: '#f59e0b',
} as const;

// Style cards KPI service — même palette que dashboard
const SERVICES = [
  {
    key:        'boarding'   as const,
    color:      '#c9a84c',
    cardClass:  'bg-gradient-to-br from-[#FBF5E0] to-[#FDF8EC] border-[#E2C048]/30',
    labelClass: 'text-gold-700',
    amtClass:   'text-gold-800',
    subClass:   'text-gold-600',
  },
  {
    key:        'taxi'       as const,
    color:      '#4a90d9',
    cardClass:  'bg-gradient-to-br from-[#EBF4FF] to-[#F0F7FF] border-blue-200/50',
    labelClass: 'text-blue-700',
    amtClass:   'text-blue-800',
    subClass:   'text-blue-600',
  },
  {
    key:        'grooming'   as const,
    color:      '#8b5cf6',
    cardClass:  'bg-gradient-to-br from-[#F3EEFF] to-[#F7F2FF] border-purple-200/50',
    labelClass: 'text-purple-700',
    amtClass:   'text-purple-800',
    subClass:   'text-purple-600',
  },
  {
    key:        'croquettes' as const,
    color:      '#f59e0b',
    cardClass:  'bg-gradient-to-br from-[#FEF3E2] to-[#FFF8EE] border-orange-200/50',
    labelClass: 'text-orange-700',
    amtClass:   'text-orange-800',
    subClass:   'text-orange-600',
  },
];

export default function AnalyticsCharts({
  serviceKpis, yearlyData, lastYearData, donutData, volumeData,
  avgBasket, avgNights, newClients, totalCA: _totalCA, totalDelta: _totalDelta,
  locale, currentYear,
}: Props) {
  const isFr = locale === 'fr';

  const serviceLabels = {
    boarding:   { label: isFr ? 'Pension'    : 'Boarding', sub: isFr ? 'séjours'  : 'stays'    },
    taxi:       { label: 'Taxi',                             sub: isFr ? 'courses'  : 'rides'    },
    grooming:   { label: isFr ? 'Toilettage' : 'Grooming', sub: isFr ? 'soins'    : 'sessions' },
    croquettes: { label: 'Croquettes',                       sub: isFr ? 'ventes'   : 'sales'    },
  };

  return (
    <div className="space-y-5">

      {/* ── Ligne 1 — 4 KPI cards par service ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SERVICES.map(svc => {
          const kpi = serviceKpis[svc.key];
          const { label, sub } = serviceLabels[svc.key];
          const deltaClass = kpi.delta > 0 ? 'text-green-600' : kpi.delta < 0 ? 'text-red-500' : 'text-gray-400';
          return (
            <div
              key={svc.key}
              className={`rounded-xl border p-5 shadow-card ${svc.cardClass}`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-semibold uppercase tracking-wider ${svc.labelClass}`}>
                  {label}
                </span>
                <span className={`text-xs ${svc.subClass}`}>
                  {kpi.count} {sub}
                </span>
              </div>
              <p className={`text-xl font-bold mb-1 ${svc.amtClass}`}>{formatMAD(kpi.thisAmt)}</p>
              <p className={`text-xs font-medium ${deltaClass}`}>
                {kpi.delta > 0 ? '+' : ''}{kpi.delta}%{' '}
                {isFr ? 'vs mois préc.' : 'vs prev. month'}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Ligne 2 — Area chart performance ── */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="font-semibold text-charcoal">
            {isFr
              ? `Performance par activité — ${currentYear}`
              : `Activity Performance — ${currentYear}`}
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            {SERVICES.map(svc => (
              <div key={svc.key} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[svc.key] }} />
                <span className="text-xs text-gray-500">{serviceLabels[svc.key].label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <svg width="16" height="4" viewBox="0 0 16 4">
                <line x1="0" y1="2" x2="16" y2="2" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4 3" />
              </svg>
              <span className="text-xs text-gray-400">{currentYear - 1}</span>
            </div>
          </div>
        </div>
        <AnalyticsPerformanceChart data={yearlyData} lastYearData={lastYearData} locale={locale} />
      </div>

      {/* ── Ligne 3 — Volume + Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
          <h2 className="font-semibold text-charcoal mb-5">
            {isFr ? 'Volume Mensuel' : 'Monthly Volume'}
          </h2>
          <AnalyticsVolumeChart data={volumeData} locale={locale} />
        </div>

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
          <h2 className="font-semibold text-charcoal mb-5">
            {isFr ? 'Répartition Activités' : 'Activity Breakdown'}
          </h2>
          <AnalyticsBreakdownDonut data={donutData} locale={locale} />
        </div>
      </div>

      {/* ── Ligne 4 — KPIs secondaires ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide mb-2 text-gray-500">
            {isFr ? 'Panier Moyen' : 'Avg Basket'}
          </p>
          <p className="text-2xl font-bold text-charcoal">{formatMAD(avgBasket)}</p>
          <p className="text-xs mt-1 text-gray-400">
            {isFr ? 'par client ce mois' : 'per client this month'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide mb-2 text-gray-500">
            {isFr ? 'Durée Moy. Séjour' : 'Avg Stay'}
          </p>
          <p className="text-2xl font-bold text-charcoal">{avgNights}</p>
          <p className="text-xs mt-1 text-gray-400">
            {isFr ? 'nuits ce mois' : 'nights this month'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide mb-2 text-gray-500">
            {isFr ? 'Nouveaux Clients' : 'New Clients'}
          </p>
          <p className="text-2xl font-bold text-green-600">{newClients}</p>
          <p className="text-xs mt-1 text-gray-400">
            {isFr ? 'ce mois' : 'this month'}
          </p>
        </div>
      </div>

    </div>
  );
}
