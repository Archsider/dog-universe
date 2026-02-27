'use client';

import RevenueChart from '@/components/admin/RevenueChart';
import ServiceBreakdown from '@/components/admin/ServiceBreakdown';

interface Props {
  revenueData: { month: string; boarding: number; taxi: number }[];
  boardingRevenue: number;
  taxiRevenue: number;
  locale: string;
  labels: { revenueChart: string; breakdown: string };
}

export default function AnalyticsCharts({ revenueData, boardingRevenue, taxiRevenue, locale, labels }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <h2 className="font-semibold text-charcoal mb-4">{labels.revenueChart}</h2>
        <RevenueChart data={revenueData} locale={locale} />
      </div>
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card flex flex-col">
        <h2 className="font-semibold text-charcoal mb-4">{labels.breakdown}</h2>
        <div className="flex-1 flex items-center justify-center">
          <ServiceBreakdown boardingRevenue={boardingRevenue} taxiRevenue={taxiRevenue} locale={locale} />
        </div>
      </div>
    </div>
  );
}
