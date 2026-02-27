'use client';

import RevenueChart from '@/components/admin/RevenueChart';

interface Props {
  data: { month: string; boarding: number; taxi: number }[];
  locale: string;
}

export default function RevenueChartWrapper({ data, locale }: Props) {
  return <RevenueChart data={data} locale={locale} />;
}
