'use client';

import dynamic from 'next/dynamic';

const RevenueChart = dynamic(() => import('@/components/admin/RevenueChart'), {
  ssr: false,
  loading: () => <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">Chargement...</div>,
});

const ServiceBreakdown = dynamic(() => import('@/components/admin/ServiceBreakdown'), {
  ssr: false,
  loading: () => <div className="h-[180px] flex items-center justify-center text-sm text-gray-400">Chargement...</div>,
});

interface Props {
  revenueData: { month: string; boarding: number; taxi: number; grooming?: number }[];
  boardingRevenue: number;
  taxiRevenue: number;
  groomingRevenue: number;
  locale: string;
  labels: { revenueChart: string; breakdown: string };
}

export default function AnalyticsCharts({ revenueData, boardingRevenue, taxiRevenue, groomingRevenue, locale, labels }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <h2 className="font-semibold text-charcoal mb-4">{labels.revenueChart}</h2>
        <RevenueChart data={revenueData} locale={locale} />
      </div>
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card flex flex-col">
        <h2 className="font-semibold text-charcoal mb-4">{labels.breakdown}</h2>
        <div className="flex-1">
          <ServiceBreakdown
            boardingRevenue={boardingRevenue}
            taxiRevenue={taxiRevenue}
            groomingRevenue={groomingRevenue}
            locale={locale}
          />
        </div>
      </div>
    </div>
  );
}
