'use client';

import dynamic from 'next/dynamic';
import { formatMAD } from '@/lib/utils';

const AnalyticsPerformanceChart = dynamic(
  () => import('@/components/admin/analytics/AnalyticsPerformanceChart'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] flex items-center justify-center text-sm" style={{ color: '#6b7280' }}>
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
      <div className="h-[200px] flex items-center justify-center text-sm" style={{ color: '#6b7280' }}>
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
      <div className="h-[200px] flex items-center justify-center text-sm" style={{ color: '#6b7280' }}>
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

const CARD_BG = '#1a1d27';
const BORDER  = '1px solid rgba(255,255,255,0.08)';

const SERVICES = [
  { key: 'boarding'   as const, color: '#c9a84c', borderColor: 'rgba(201,168,76,0.3)'  },
  { key: 'taxi'       as const, color: '#4a90d9', borderColor: 'rgba(74,144,217,0.3)'  },
  { key: 'grooming'   as const, color: '#8b5cf6', borderColor: 'rgba(139,92,246,0.3)'  },
  { key: 'croquettes' as const, color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)'  },
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
          const deltaColor = kpi.delta > 0 ? '#22c55e' : kpi.delta < 0 ? '#ef4444' : '#6b7280';
          return (
            <div
              key={svc.key}
              className="rounded-xl p-5"
              style={{
                backgroundColor: CARD_BG,
                border: `1px solid ${svc.borderColor}`,
                borderLeft: `3px solid ${svc.color}`,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: svc.color }}>
                  {label}
                </span>
                <span className="text-xs" style={{ color: '#6b7280' }}>
                  {kpi.count} {sub}
                </span>
              </div>
              <p className="text-xl font-bold text-white mb-1">{formatMAD(kpi.thisAmt)}</p>
              <p className="text-xs font-medium" style={{ color: deltaColor }}>
                {kpi.delta > 0 ? '+' : ''}{kpi.delta}%{' '}
                {isFr ? 'vs mois préc.' : 'vs prev. month'}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Ligne 2 — Area chart performance ── */}
      <div className="rounded-xl p-6" style={{ backgroundColor: CARD_BG, border: BORDER }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="font-semibold text-white">
            {isFr
              ? `Performance par activité — ${currentYear}`
              : `Activity Performance — ${currentYear}`}
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            {SERVICES.map(svc => (
              <div key={svc.key} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: svc.color }} />
                <span className="text-xs" style={{ color: '#9ca3af' }}>
                  {serviceLabels[svc.key].label}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <svg width="16" height="4" viewBox="0 0 16 4">
                <line x1="0" y1="2" x2="16" y2="2" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4 3" />
              </svg>
              <span className="text-xs" style={{ color: '#6b7280' }}>{currentYear - 1}</span>
            </div>
          </div>
        </div>
        <AnalyticsPerformanceChart data={yearlyData} lastYearData={lastYearData} locale={locale} />
      </div>

      {/* ── Ligne 3 — Volume + Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Volume Mensuel */}
        <div className="rounded-xl p-6" style={{ backgroundColor: CARD_BG, border: BORDER }}>
          <h2 className="font-semibold text-white mb-5">
            {isFr ? 'Volume Mensuel' : 'Monthly Volume'}
          </h2>
          <AnalyticsVolumeChart data={volumeData} locale={locale} />
        </div>

        {/* Répartition Activités */}
        <div className="rounded-xl p-6" style={{ backgroundColor: CARD_BG, border: BORDER }}>
          <h2 className="font-semibold text-white mb-5">
            {isFr ? 'Répartition Activités' : 'Activity Breakdown'}
          </h2>
          <AnalyticsBreakdownDonut data={donutData} locale={locale} />
        </div>
      </div>

      {/* ── Ligne 4 — KPIs secondaires ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl p-5" style={{ backgroundColor: CARD_BG, border: BORDER }}>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#6b7280' }}>
            {isFr ? 'Panier Moyen' : 'Avg Basket'}
          </p>
          <p className="text-2xl font-bold text-white">{formatMAD(avgBasket)}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            {isFr ? 'par client ce mois' : 'per client this month'}
          </p>
        </div>
        <div className="rounded-xl p-5" style={{ backgroundColor: CARD_BG, border: BORDER }}>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#6b7280' }}>
            {isFr ? 'Durée Moy. Séjour' : 'Avg Stay'}
          </p>
          <p className="text-2xl font-bold text-white">{avgNights}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            {isFr ? 'nuits ce mois' : 'nights this month'}
          </p>
        </div>
        <div className="rounded-xl p-5" style={{ backgroundColor: CARD_BG, border: BORDER }}>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#6b7280' }}>
            {isFr ? 'Nouveaux Clients' : 'New Clients'}
          </p>
          <p className="text-2xl font-bold" style={{ color: '#4ade80' }}>{newClients}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            {isFr ? 'ce mois' : 'this month'}
          </p>
        </div>
      </div>

    </div>
  );
}
