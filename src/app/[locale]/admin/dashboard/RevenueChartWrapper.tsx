'use client';

import dynamic from 'next/dynamic';

const RevenueChart = dynamic(() => import('@/components/admin/RevenueChart'), {
  ssr: false,
  loading: () => <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">Chargement...</div>,
});

interface Props {
  data: { month: string; boarding: number; taxi: number }[];
  locale: string;
}

export default function RevenueChartWrapper({ data, locale }: Props) {
  return <RevenueChart data={data} locale={locale} />;
}
