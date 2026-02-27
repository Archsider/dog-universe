import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Users, PawPrint, Calendar, TrendingUp, Clock, AlertCircle } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import RevenueChartWrapper from './RevenueChartWrapper';

interface PageProps { params: { locale: string } }

export default async function AdminDashboardPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLast12Months = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [
    totalClients,
    totalPets,
    pendingBookings,
    currentBoarders,
    monthlyRevenue,
    recentBookings,
    revenueData,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'CLIENT' } }),
    prisma.pet.count(),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.booking.count({
      where: {
        serviceType: 'BOARDING',
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        startDate: { lte: now },
        endDate: { gte: now },
      },
    }),
    prisma.invoice.aggregate({
      where: { status: 'PAID', issuedAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    prisma.booking.findMany({
      include: {
        client: { select: { name: true, email: true } },
        bookingPets: { include: { pet: { select: { name: true } } } },
      },
      orderBy: { startDate: 'desc' },
      take: 8,
    }),
    prisma.invoice.findMany({
      where: { status: 'PAID', issuedAt: { gte: startOfLast12Months } },
      select: { amount: true, issuedAt: true, booking: { select: { serviceType: true } } },
    }),
  ]);

  // Build monthly chart data
  const monthlyData: Record<string, { boarding: number; taxi: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
    monthlyData[key] = { boarding: 0, taxi: 0 };
  }
  revenueData.forEach(inv => {
    const d = new Date(inv.issuedAt);
    const key = d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
    if (monthlyData[key]) {
      if (inv.booking?.serviceType === 'PET_TAXI') monthlyData[key].taxi += inv.amount;
      else monthlyData[key].boarding += inv.amount;
    }
  });
  const chartData = Object.entries(monthlyData).map(([month, v]) => ({ month, ...v }));

  const labels = {
    fr: {
      title: 'Tableau de bord',
      clients: 'Clients',
      pets: 'Animaux',
      pending: 'En attente',
      boarding: 'Pension actuelle',
      monthRevenue: 'Revenu ce mois',
      recentBookings: 'Réservations récentes',
      viewAll: 'Voir tout',
      revenueTitle: 'Revenus (12 derniers mois)',
    },
    en: {
      title: 'Dashboard',
      clients: 'Clients',
      pets: 'Pets',
      pending: 'Pending',
      boarding: 'Current boarders',
      monthRevenue: 'Revenue this month',
      recentBookings: 'Recent bookings',
      viewAll: 'View all',
      revenueTitle: 'Revenue (last 12 months)',
    },
  };

  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    CONFIRMED: 'bg-green-100 text-green-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    COMPLETED: 'bg-gray-100 text-gray-600',
    CANCELLED: 'bg-red-100 text-red-600',
    REJECTED: 'bg-red-100 text-red-600',
  };

  const statusLabels: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', CANCELLED: 'Annulé', REJECTED: 'Refusé', COMPLETED: 'Terminé', IN_PROGRESS: 'En cours' },
    en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', COMPLETED: 'Completed', IN_PROGRESS: 'In progress' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const sl = statusLabels[locale] || statusLabels.fr;

  const stats = [
    { label: l.clients, value: totalClients, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50', href: `/${locale}/admin/clients` },
    { label: l.pets, value: totalPets, icon: PawPrint, color: 'text-green-500', bg: 'bg-green-50', href: `/${locale}/admin/animals` },
    { label: l.pending, value: pendingBookings, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', href: `/${locale}/admin/reservations?status=PENDING` },
    { label: l.boarding, value: currentBoarders, icon: Calendar, color: 'text-gold-500', bg: 'bg-gold-50', href: `/${locale}/admin/reservations` },
    { label: l.monthRevenue, value: formatMAD(monthlyRevenue._sum.amount || 0), icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-50', href: `/${locale}/admin/billing` },
  ];

  return (
    <div>
      <h1 className="text-2xl font-serif font-bold text-charcoal mb-6">{l.title}</h1>

      {pendingBookings > 0 && (
        <Link href={`/${locale}/admin/reservations?status=PENDING`}>
          <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors cursor-pointer">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <span className="text-amber-700 font-medium">
              {pendingBookings} {locale === 'fr' ? `réservation${pendingBookings > 1 ? 's' : ''} en attente de confirmation` : `booking${pendingBookings > 1 ? 's' : ''} pending confirmation`}
            </span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card hover:shadow-card-hover transition-shadow">
              <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div className="text-xl font-bold text-charcoal">{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
          <h2 className="font-semibold text-charcoal mb-4">{l.revenueTitle}</h2>
          <RevenueChartWrapper data={chartData} locale={locale} />
        </div>

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-charcoal">{l.recentBookings}</h2>
            <Link href={`/${locale}/admin/reservations`} className="text-xs text-gold-600 hover:underline">{l.viewAll}</Link>
          </div>
          <div className="space-y-3">
            {recentBookings.map(booking => (
              <Link key={booking.id} href={`/${locale}/admin/reservations/${booking.id}`}>
                <div className="flex items-center justify-between py-2 border-b border-ivory-100 last:border-0 hover:bg-ivory-50 -mx-2 px-2 rounded transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate">
                      {booking.client.name || booking.client.email}
                    </p>
                    <p className="text-xs text-gray-400">{booking.bookingPets.map(bp => bp.pet.name).join(', ')}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${statusColors[booking.status] || 'bg-gray-100 text-gray-600'}`}>
                    {sl[booking.status] || booking.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
