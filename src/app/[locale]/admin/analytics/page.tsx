import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { formatMAD } from '@/lib/utils';
import AnalyticsCharts from './AnalyticsCharts';

interface PageProps { params: { locale: string } }

export default async function AdminAnalyticsPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  let analytics: Record<string, unknown> | null = null;
  try {
    const res = await fetch(`${baseUrl}/api/admin/analytics`, {
      headers: { cookie: '' },
      cache: 'no-store',
    });
    if (res.ok) analytics = await res.json();
  } catch {
    // fallback to empty
  }

  const labels = {
    fr: {
      title: 'Analytiques',
      revenueChart: 'Évolution du chiffre d\'affaires',
      breakdown: 'Répartition des services',
      clientSegments: 'Segmentation clients',
      monthlyRevenue: 'CA ce mois',
      currentBoarders: 'Pension actuelle',
      pendingBookings: 'En attente',
      newClients: 'Nouveaux clients',
      avgBasket: 'Panier moyen',
      avgDuration: 'Durée moy. séjour',
      nights: 'nuits',
      active: 'Actifs',
      semiActive: 'Semi-actifs',
      inactive: 'Inactifs',
      activeSub: '< 90 jours',
      semiActiveSub: '90–180 jours',
      inactiveSub: '> 180 jours',
    },
    en: {
      title: 'Analytics',
      revenueChart: 'Revenue trend',
      breakdown: 'Service breakdown',
      clientSegments: 'Client segmentation',
      monthlyRevenue: 'Revenue this month',
      currentBoarders: 'Current boarders',
      pendingBookings: 'Pending',
      newClients: 'New clients',
      avgBasket: 'Avg basket',
      avgDuration: 'Avg stay',
      nights: 'nights',
      active: 'Active',
      semiActive: 'Semi-active',
      inactive: 'Inactive',
      activeSub: '< 90 days',
      semiActiveSub: '90–180 days',
      inactiveSub: '> 180 days',
    },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;

  // Correct field mapping from API response
  const monthlyRevenue = (analytics?.monthlyRevenue as number) ?? 0;
  const currentBoarders = (analytics?.currentBoarders as number) ?? 0;
  const pendingReservations = (analytics?.pendingReservations as number) ?? 0;
  const newClientsThisMonth = (analytics?.newClientsThisMonth as number) ?? 0;
  const avgBasket = (analytics?.avgBasket as number) ?? 0;
  const avgStayDuration = (analytics?.avgStayDuration as number) ?? 0;
  const last12Months = (analytics?.last12Months as { month: string; boarding: number; taxi: number }[]) ?? [];
  const revenueBreakdown = (analytics?.revenueBreakdown as { boarding: number; taxi: number; grooming: number }) ?? { boarding: 0, taxi: 0, grooming: 0 };
  const segments = (analytics?.clientSegmentation as { active: number; semiActive: number; inactive: number }) ?? { active: 0, semiActive: 0, inactive: 0 };

  const kpis = [
    { label: l.monthlyRevenue, value: formatMAD(monthlyRevenue), color: 'text-gold-600' },
    { label: l.currentBoarders, value: currentBoarders, color: 'text-blue-600' },
    { label: l.pendingBookings, value: pendingReservations, color: 'text-amber-600' },
    { label: l.newClients, value: newClientsThisMonth, color: 'text-green-600' },
    { label: l.avgBasket, value: formatMAD(avgBasket), color: 'text-purple-600' },
    { label: l.avgDuration, value: `${avgStayDuration} ${l.nights}`, color: 'text-indigo-600' },
  ];

  const segmentRows = [
    { label: l.active, sub: l.activeSub, value: segments.active, color: 'text-green-600', bg: 'bg-green-50', bar: 'bg-green-400' },
    { label: l.semiActive, sub: l.semiActiveSub, value: segments.semiActive, color: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-400' },
    { label: l.inactive, sub: l.inactiveSub, value: segments.inactive, color: 'text-gray-500', bg: 'bg-gray-50', bar: 'bg-gray-300' },
  ];
  const totalSegments = segments.active + segments.semiActive + segments.inactive || 1;

  return (
    <div>
      <h1 className="text-2xl font-serif font-bold text-charcoal mb-6">{l.title}</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Revenue chart + breakdown */}
      <AnalyticsCharts
        revenueData={last12Months}
        boardingRevenue={revenueBreakdown.boarding}
        taxiRevenue={revenueBreakdown.taxi}
        groomingRevenue={revenueBreakdown.grooming}
        locale={locale}
        labels={l}
      />

      {/* Client segmentation */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card mt-6">
        <h2 className="font-semibold text-charcoal mb-5">{l.clientSegments}</h2>
        <div className="space-y-4">
          {segmentRows.map(s => (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className={`text-sm font-medium ${s.color}`}>{s.label}</span>
                  <span className="text-xs text-gray-400 ml-2">{s.sub}</span>
                </div>
                <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-100">
                <div
                  className={`h-2 rounded-full ${s.bar} transition-all`}
                  style={{ width: `${Math.round((s.value / totalSegments) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
