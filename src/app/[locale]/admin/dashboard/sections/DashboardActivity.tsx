// Server async component — streams in via <Suspense> on the dashboard.
// Fetches the chart data + recent bookings independently from the KPI block,
// so the top-of-fold renders before these queries finish.
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { cashByMonth } from '@/lib/metrics';
import RevenueChartWrapper from '../RevenueChartWrapper';
import { notDeleted } from '@/lib/prisma-soft';

interface Props {
  locale: string;
  labels: {
    recentBookings: string;
    viewAll: string;
    revenueTitle: string;
  };
  statusLabels: Record<string, string>;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-600',
  REJECTED: 'bg-red-100 text-red-600',
};

export default async function DashboardActivity({ locale, labels, statusLabels }: Props) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const [recentBookings, lastYearMonthly, currentYearMonthly] = await Promise.all([
    prisma.booking.findMany({
      where: notDeleted(),
      select: {
        id: true,
        status: true,
        client: { select: { name: true, email: true } },
        bookingPets: { select: { pet: { select: { name: true } } } },
      },
      orderBy: { startDate: 'desc' },
      take: 8,
    }),
    cashByMonth(currentYear - 1),
    cashByMonth(currentYear),
  ]);

  const chartLocale = locale === 'fr' ? 'fr-FR' : 'en-US';
  const chartData: { month: string; boarding: number; taxi: number; grooming: number; croquettes: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString(chartLocale, { month: 'short', year: '2-digit' });
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const entry = yr === currentYear ? currentYearMonthly[mo] : lastYearMonthly[mo];
    chartData.push({ month: key, boarding: entry.boarding, taxi: entry.taxi, grooming: entry.grooming, croquettes: entry.croquettes });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <h2 className="font-semibold text-charcoal mb-4">{labels.revenueTitle}</h2>
        <RevenueChartWrapper data={chartData} locale={locale} />
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-charcoal">{labels.recentBookings}</h2>
          <Link href={`/${locale}/admin/reservations`} className="text-xs text-gold-600 hover:underline">{labels.viewAll}</Link>
        </div>
        <div className="space-y-3">
          {recentBookings.map((booking) => (
            <Link key={booking.id} href={`/${locale}/admin/reservations/${booking.id}`}>
              <div className="flex items-center justify-between py-2 border-b border-ivory-100 last:border-0 hover:bg-ivory-50 -mx-2 px-2 rounded transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate">
                    {booking.client.name || booking.client.email}
                  </p>
                  <p className="text-xs text-gray-400">{booking.bookingPets.map((bp) => bp.pet.name).join(', ')}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${STATUS_COLORS[booking.status] || 'bg-gray-100 text-gray-600'}`}>
                  {statusLabels[booking.status] || booking.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
