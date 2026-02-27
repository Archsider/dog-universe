import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { formatMAD } from '@/lib/utils';
import AnalyticsCharts from './AnalyticsCharts';

interface PageProps { params: { locale: string } }

export default async function AdminAnalyticsPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  // Fetch analytics from our API
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  let analytics = null;
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
      kpis: 'Indicateurs clés',
      revenueChart: 'Revenus mensuels',
      breakdown: 'Répartition des services',
      clientSegments: 'Segments clients',
      monthlyRevenue: 'Revenu mensuel',
      currentBoarders: 'Pension actuelle',
      pendingBookings: 'Réservations en attente',
      newClients: 'Nouveaux clients',
      active: 'Actifs (< 90 jours)',
      semiActive: 'Semi-actifs (90-180 jours)',
      inactive: 'Inactifs (> 180 jours)',
      avgBasket: 'Panier moyen',
      avgDuration: 'Durée moyenne',
      nights: 'nuits',
    },
    en: {
      title: 'Analytics',
      kpis: 'Key indicators',
      revenueChart: 'Monthly revenue',
      breakdown: 'Service breakdown',
      clientSegments: 'Client segments',
      monthlyRevenue: 'Monthly revenue',
      currentBoarders: 'Current boarders',
      pendingBookings: 'Pending bookings',
      newClients: 'New clients',
      active: 'Active (< 90 days)',
      semiActive: 'Semi-active (90-180 days)',
      inactive: 'Inactive (> 180 days)',
      avgBasket: 'Avg basket',
      avgDuration: 'Avg duration',
      nights: 'nights',
    },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;

  const kpis = analytics?.kpis || {};
  const segments = analytics?.clientSegmentation || {};

  return (
    <div>
      <h1 className="text-2xl font-serif font-bold text-charcoal mb-6">{l.title}</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: l.monthlyRevenue, value: formatMAD(kpis.monthlyRevenue || 0), color: 'text-gold-600' },
          { label: l.currentBoarders, value: kpis.currentBoarders || 0, color: 'text-blue-600' },
          { label: l.pendingBookings, value: kpis.pendingBookings || 0, color: 'text-amber-600' },
          { label: l.newClients, value: kpis.newClientsThisMonth || 0, color: 'text-green-600' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Charts passed to client component */}
      <AnalyticsCharts
        revenueData={analytics?.revenueByMonth || []}
        boardingRevenue={kpis.boardingRevenue || 0}
        taxiRevenue={kpis.taxiRevenue || 0}
        locale={locale}
        labels={l}
      />

      {/* Client segments */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card mt-6">
        <h2 className="font-semibold text-charcoal mb-4">{l.clientSegments}</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { label: l.active, value: segments.active || 0, color: 'text-green-600 bg-green-50' },
            { label: l.semiActive, value: segments.semiActive || 0, color: 'text-amber-600 bg-amber-50' },
            { label: l.inactive, value: segments.inactive || 0, color: 'text-gray-500 bg-gray-50' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl p-4 ${s.color.split(' ')[1]}`}>
              <div className={`text-3xl font-bold ${s.color.split(' ')[0]}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
