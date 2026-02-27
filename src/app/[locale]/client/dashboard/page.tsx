import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { LoyaltyBadge } from '@/components/shared/LoyaltyBadge';
import { PawPrint, Calendar, FileText, History, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { formatDate, formatDateShort, formatMAD, calculateNights } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type Params = { locale: string };

export default async function ClientDashboard({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations('dashboard');

  // Fetch all data in parallel
  const [pets, upcomingBookings, recentInvoices, loyaltyGrade] = await Promise.all([
    prisma.pet.findMany({
      where: { ownerId: session.user.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.booking.findMany({
      where: {
        clientId: session.user.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gte: new Date() },
      },
      include: {
        bookingPets: { include: { pet: true } },
        boardingDetail: true,
        taxiDetail: true,
      },
      orderBy: { startDate: 'asc' },
      take: 3,
    }),
    prisma.invoice.findMany({
      where: { clientId: session.user.id },
      include: { items: true },
      orderBy: { issuedAt: 'desc' },
      take: 3,
    }),
    prisma.loyaltyGrade.findUnique({ where: { clientId: session.user.id } }),
  ]);

  const totalStays = await prisma.booking.count({
    where: { clientId: session.user.id, status: 'COMPLETED' },
  });

  const totalSpent = await prisma.invoice.aggregate({
    where: { clientId: session.user.id, status: 'PAID' },
    _sum: { amount: true },
  });

  const grade = loyaltyGrade?.grade ?? 'BRONZE';

  const statusColors: Record<string, string> = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  };

  const statusLabels: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', CONFIRMED: 'Confirmée', COMPLETED: 'Terminée', CANCELLED: 'Annulée' },
    en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled' },
  };

  const serviceLabels: Record<string, Record<string, string>> = {
    fr: { BOARDING: 'Pension', PET_TAXI: 'Taxi animalier' },
    en: { BOARDING: 'Boarding', PET_TAXI: 'Pet Taxi' },
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-serif font-bold text-charcoal">
          {t('greeting', { name: session.user.name.split(' ')[0] })}
        </h1>
        <p className="text-charcoal/60 mt-1">{t('subtitle')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs text-charcoal/50 uppercase tracking-wide font-medium">{t('stats.pets')}</p>
          <p className="text-3xl font-serif font-bold text-charcoal mt-1">{pets.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs text-charcoal/50 uppercase tracking-wide font-medium">{t('stats.totalStays')}</p>
          <p className="text-3xl font-serif font-bold text-charcoal mt-1">{totalStays}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs text-charcoal/50 uppercase tracking-wide font-medium">{t('stats.totalSpent')}</p>
          <p className="text-2xl font-serif font-bold text-gold-600 mt-1">
            {formatMAD(totalSpent._sum.amount ?? 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs text-charcoal/50 uppercase tracking-wide font-medium">{t('stats.loyalty')}</p>
          <div className="mt-2">
            <LoyaltyBadge grade={grade} locale={locale} size="md" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-serif font-semibold text-charcoal mb-3">
          {locale === 'fr' ? 'Actions rapides' : 'Quick Actions'}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: `/${locale}/client/bookings/new`, label: t('quickActions.book'), icon: Calendar, color: 'bg-gold-50 text-gold-700 border-gold-200' },
            { href: `/${locale}/client/pets`, label: t('quickActions.myPets'), icon: PawPrint, color: 'bg-blue-50 text-blue-700 border-blue-200' },
            { href: `/${locale}/client/invoices`, label: t('quickActions.invoices'), icon: FileText, color: 'bg-green-50 text-green-700 border-green-200' },
            { href: `/${locale}/client/history`, label: t('quickActions.history'), icon: History, color: 'bg-purple-50 text-purple-700 border-purple-200' },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border ${action.color} hover:shadow-md transition-shadow`}
              >
                <Icon className="h-6 w-6" />
                <span className="text-sm font-medium">{action.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* My Pets */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-serif font-semibold text-charcoal">{t('myPets')}</h2>
            <Link href={`/${locale}/client/pets`} className="text-sm text-gold-600 hover:text-gold-700 font-medium">
              {t('viewAllPets')} →
            </Link>
          </div>
          {pets.length === 0 ? (
            <div className="text-center py-6">
              <PawPrint className="h-8 w-8 text-charcoal/20 mx-auto mb-2" />
              <p className="text-sm text-charcoal/50">
                {locale === 'fr' ? 'Aucun animal enregistré' : 'No pets registered'}
              </p>
              <Link href={`/${locale}/client/pets/new`} className="text-sm text-gold-600 font-medium mt-1 inline-block">
                + {locale === 'fr' ? 'Ajouter un animal' : 'Add a pet'}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {pets.slice(0, 4).map((pet) => (
                <Link key={pet.id} href={`/${locale}/client/pets/${pet.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#FAF6F0] transition-colors">
                  <div className="h-10 w-10 rounded-full bg-gold-100 flex items-center justify-center flex-shrink-0">
                    {pet.photoUrl ? (
                      <img src={pet.photoUrl} alt={pet.name} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <PawPrint className="h-5 w-5 text-gold-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-charcoal text-sm">{pet.name}</p>
                    <p className="text-xs text-charcoal/50">
                      {pet.breed ?? (locale === 'fr' ? (pet.species === 'DOG' ? 'Chien' : 'Chat') : pet.species.toLowerCase())}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Bookings */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-serif font-semibold text-charcoal">{t('upcomingBookings')}</h2>
            <Link href={`/${locale}/client/history`} className="text-sm text-gold-600 hover:text-gold-700 font-medium">
              {t('viewAllBookings')} →
            </Link>
          </div>
          {upcomingBookings.length === 0 ? (
            <div className="text-center py-6">
              <Calendar className="h-8 w-8 text-charcoal/20 mx-auto mb-2" />
              <p className="text-sm text-charcoal/50">{t('noUpcomingBookings')}</p>
              <Link href={`/${locale}/client/bookings/new`} className="text-sm text-gold-600 font-medium mt-1 inline-block">
                + {t('bookNow')}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((booking) => (
                <Link key={booking.id} href={`/${locale}/client/history`}
                  className="block p-3 rounded-lg border border-[#F0D98A]/30 hover:bg-[#FAF6F0] transition-colors">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-charcoal">
                      {serviceLabels[locale]?.[booking.serviceType] ?? booking.serviceType}
                    </span>
                    <Badge variant={statusColors[booking.status] as Parameters<typeof Badge>[0]['variant']}>
                      {statusLabels[locale]?.[booking.status] ?? booking.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-charcoal/60">
                    {booking.bookingPets.map((bp) => bp.pet.name).join(', ')}
                    {' · '}
                    {formatDateShort(booking.startDate, locale)}
                    {booking.endDate && ` → ${formatDateShort(booking.endDate, locale)}`}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-serif font-semibold text-charcoal">{t('recentInvoices')}</h2>
          <Link href={`/${locale}/client/invoices`} className="text-sm text-gold-600 hover:text-gold-700 font-medium">
            {t('viewAllInvoices')} →
          </Link>
        </div>
        {recentInvoices.length === 0 ? (
          <p className="text-sm text-charcoal/50 text-center py-4">
            {locale === 'fr' ? 'Aucune facture' : 'No invoices'}
          </p>
        ) : (
          <div className="space-y-2">
            {recentInvoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-[#FAF6F0] transition-colors">
                <div>
                  <p className="text-sm font-medium text-charcoal">{invoice.invoiceNumber}</p>
                  <p className="text-xs text-charcoal/50">{formatDateShort(invoice.issuedAt, locale)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gold-700">{formatMAD(invoice.amount)}</span>
                  {invoice.status === 'PAID' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
