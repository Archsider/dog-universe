import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { MemberCard } from '@/components/shared/MemberCard';
import { Grade } from '@/lib/loyalty';
import { PawPrint, Calendar, FileText, History, CheckCircle, AlertCircle } from 'lucide-react';
import { formatDateShort, formatMAD } from '@/lib/utils';

type Params = { locale: string };

export default async function ClientDashboard({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations('dashboard');

  const [pets, upcomingBookings, recentInvoices, loyaltyGrade, myClaims] = await Promise.all([
    prisma.pet.findMany({
      where: { ownerId: session.user.id },
      select: { id: true, name: true, species: true, breed: true, photoUrl: true, createdAt: true },
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
    prisma.loyaltyBenefitClaim.findMany({
      where: { clientId: session.user.id },
      select: { benefitKey: true, status: true },
      orderBy: { claimedAt: 'desc' },
    }),
  ]);

  const [totalStays, totalSpent] = await Promise.all([
    prisma.booking.count({ where: { clientId: session.user.id, status: 'COMPLETED' } }),
    prisma.invoice.aggregate({ where: { clientId: session.user.id, status: 'PAID' }, _sum: { amount: true } }),
  ]);

  const grade = (loyaltyGrade?.grade ?? 'BRONZE') as Grade;

  // Loyalty progression — next tier target in stays
  const nextTier =
    grade === 'BRONZE' ? { label: 'Silver', target: 4 } :
    grade === 'SILVER' ? { label: 'Gold', target: 10 } :
    grade === 'GOLD' ? { label: 'Platinum', target: 20 } :
    null;
  const remainingStays = nextTier ? Math.max(0, nextTier.target - totalStays) : 0;
  const progressPercent = nextTier
    ? Math.min((totalStays / nextTier.target) * 100, 100)
    : 100;
  // 8 paw slots regardless of target — first `totalStays` filled
  const pawSlots = 8;

  // Greeting name split — first name bold + rest in italic gold
  const fullName = session.user.name ?? '';
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ');

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
      {/* Greeting — mascotte debout en flex à droite (sm+), drop-shadow propre */}
      <div className="flex justify-between items-end gap-4">
        <div className="flex-1 text-center sm:text-left">
          <p className="text-[10px] uppercase tracking-[2px] text-[#8A7E75]">
            {locale === 'fr' ? 'Bonjour' : 'Hello'}
          </p>
          <h1 className="font-serif text-4xl font-bold text-[#1C1612] mt-1 leading-tight">
            {firstName}
            {lastName && <> <span className="italic text-[#C4974A]">{lastName}</span></>}
          </h1>
          <div className="w-10 h-[2px] bg-[#C4974A] mt-3 mx-auto sm:mx-0" />
          <p className="text-sm text-[#7A6E65] mt-3">{t('subtitle')}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/mascotte-debout.png"
          alt="Mascotte Dog Universe"
          className="hidden sm:block h-40 w-auto object-contain drop-shadow-lg flex-shrink-0 mascotte-wave"
        />
      </div>

      {/* Member Card — wrapper shadow + border doré */}
      <div className="rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(196,151,74,0.12)] border border-[rgba(196,151,74,0.2)]">
        <MemberCard
          clientId={session.user.id}
          clientName={session.user.name ?? ''}
          pets={pets.map((p) => ({ name: p.name, species: p.species }))}
          grade={grade}
          totalStays={totalStays}
          totalSpentMAD={totalSpent._sum.amount ?? 0}
          locale={locale}
          claims={myClaims as { benefitKey: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' }[]}
        />
      </div>

      {/* Loyalty progress bar with paws */}
      {nextTier && (
        <div className="bg-white border border-[rgba(196,151,74,0.15)] rounded-2xl p-5 shadow-[0_4px_20px_rgba(196,151,74,0.08)]">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[11px] uppercase tracking-[1.5px] text-[#8A7E75]">
              {locale === 'fr' ? 'Progression fidélité' : 'Loyalty progress'}
            </span>
            <span className="text-[11px] text-[#C4974A]">
              {locale === 'fr'
                ? `${remainingStays} séjour${remainingStays > 1 ? 's' : ''} pour ${nextTier.label}`
                : `${remainingStays} stay${remainingStays > 1 ? 's' : ''} to ${nextTier.label}`}
            </span>
          </div>
          <div className="relative h-6 bg-[rgba(196,151,74,0.08)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#C4974A] to-[#E8C97A] rounded-full transition-all duration-700"
              style={{ width: `${progressPercent}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-around px-2 pointer-events-none">
              {Array.from({ length: pawSlots }, (_, i) => {
                const filled = i < totalStays;
                const color = filled ? 'white' : '#C4974A';
                return (
                  <svg key={i} width="12" height="12" viewBox="0 0 24 24" className={filled ? 'opacity-100' : 'opacity-25'}>
                    <ellipse cx="12" cy="17" rx="4" ry="5" fill={color}/>
                    <ellipse cx="6" cy="10" rx="2.5" ry="3" fill={color}/>
                    <ellipse cx="18" cy="10" rx="2.5" ry="3" fill={color}/>
                    <ellipse cx="9" cy="6" rx="2" ry="2.5" fill={color}/>
                    <ellipse cx="15" cy="6" rx="2" ry="2.5" fill={color}/>
                  </svg>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stats — premium cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('stats.pets'), value: pets.length, gold: false },
          { label: t('stats.totalStays'), value: totalStays, gold: false },
          { label: t('stats.totalSpent'), value: formatMAD(totalSpent._sum.amount ?? 0), gold: true },
        ].map((stat, i) => (
          <div
            key={i}
            className="bg-white border border-[rgba(196,151,74,0.15)] rounded-2xl p-5 shadow-[0_4px_20px_rgba(196,151,74,0.08)] hover:shadow-[0_8px_32px_rgba(196,151,74,0.14)] transition-shadow duration-300"
          >
            <p className={`font-serif font-bold ${stat.gold ? 'text-2xl text-[#C4974A]' : 'text-3xl text-[#1C1612]'}`}>
              {stat.value}
            </p>
            <p className="text-[10px] uppercase tracking-[1.5px] text-[#8A7E75] mt-2">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions — premium tiles */}
      <div>
        <h2 className="text-lg font-serif font-semibold text-[#1C1612] mb-3">
          {locale === 'fr' ? 'Actions rapides' : 'Quick Actions'}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: `/${locale}/client/bookings/new`, label: t('quickActions.book'), icon: Calendar },
            { href: `/${locale}/client/pets`, label: t('quickActions.myPets'), icon: PawPrint },
            { href: `/${locale}/client/invoices`, label: t('quickActions.invoices'), icon: FileText },
            { href: `/${locale}/client/history`, label: t('quickActions.history'), icon: History },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-white border border-[rgba(196,151,74,0.15)] shadow-[0_4px_16px_rgba(196,151,74,0.06)] hover:shadow-[0_8px_24px_rgba(196,151,74,0.12)] hover:border-[rgba(196,151,74,0.3)] transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-full bg-[rgba(196,151,74,0.1)] border border-[rgba(196,151,74,0.2)] flex items-center justify-center">
                  <Icon className="h-5 w-5 text-[#C4974A]" />
                </div>
                <span className="text-[13px] font-medium text-[#1C1612] text-center">{action.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Grid: Mes Animaux + Upcoming Bookings — premium */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* My Pets */}
        <div className="bg-white border border-[rgba(196,151,74,0.15)] rounded-2xl p-6 shadow-[0_4px_20px_rgba(196,151,74,0.08)]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-serif font-semibold text-[#1C1612]">{t('myPets')}</h2>
            <Link href={`/${locale}/client/pets`} className="text-sm text-[#C4974A] hover:text-[#9A7235] font-medium transition-colors">
              {t('viewAllPets')} →
            </Link>
          </div>
          {pets.length === 0 ? (
            <div className="text-center py-6">
              <PawPrint className="h-8 w-8 text-[#C4974A]/30 mx-auto mb-2" />
              <p className="text-sm text-[#7A6E65]">
                {locale === 'fr' ? 'Aucun animal enregistré' : 'No pets registered'}
              </p>
              <Link href={`/${locale}/client/pets/new`} className="text-sm text-[#C4974A] font-medium mt-1 inline-block">
                + {locale === 'fr' ? 'Ajouter un animal' : 'Add a pet'}
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[rgba(196,151,74,0.08)]">
              {pets.slice(0, 4).map((pet) => (
                <Link
                  key={pet.id}
                  href={`/${locale}/client/pets/${pet.id}`}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-[rgba(196,151,74,0.04)] -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="h-10 w-10 rounded-full border-[1.5px] border-[#C4974A] bg-[rgba(196,151,74,0.08)] flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {pet.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pet.photoUrl} alt={pet.name} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <PawPrint className="h-5 w-5 text-[#C4974A]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#1C1612] text-sm">{pet.name}</p>
                    <p className="text-xs text-[#8A7E75]">
                      {pet.breed ?? (locale === 'fr' ? (pet.species === 'DOG' ? 'Chien' : 'Chat') : pet.species.toLowerCase())}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Bookings */}
        <div className="bg-white border border-[rgba(196,151,74,0.15)] rounded-2xl p-6 shadow-[0_4px_20px_rgba(196,151,74,0.08)]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-serif font-semibold text-[#1C1612]">{t('upcomingBookings')}</h2>
            <Link href={`/${locale}/client/history`} className="text-sm text-[#C4974A] hover:text-[#9A7235] font-medium transition-colors">
              {t('viewAllBookings')} →
            </Link>
          </div>
          {upcomingBookings.length === 0 ? (
            <div className="text-center py-6">
              <Calendar className="h-8 w-8 text-[#C4974A]/30 mx-auto mb-2" />
              <p className="text-sm text-[#7A6E65]">{t('noUpcomingBookings')}</p>
              <Link href={`/${locale}/client/bookings/new`} className="text-sm text-[#C4974A] font-medium mt-1 inline-block">
                + {t('bookNow')}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((booking) => {
                const statusStyle =
                  booking.status === 'CONFIRMED' ? { bg: '#EAF7EF', color: '#1A7A45' }
                  : booking.status === 'PENDING' ? { bg: '#FEF3E2', color: '#B45309' }
                  : booking.status === 'COMPLETED' ? { bg: '#F0EFFE', color: '#5B4FCF' }
                  : { bg: '#F5F5F5', color: '#6B6B6B' };
                return (
                  <Link
                    key={booking.id}
                    href={`/${locale}/client/history`}
                    className="block p-3 rounded-xl border border-[rgba(196,151,74,0.12)] hover:bg-[rgba(196,151,74,0.04)] hover:border-[rgba(196,151,74,0.25)] transition-all"
                  >
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <span className="text-sm font-medium text-[#1C1612]">
                        {serviceLabels[locale]?.[booking.serviceType] ?? booking.serviceType}
                      </span>
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-medium flex-shrink-0"
                        style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
                      >
                        {statusLabels[locale]?.[booking.status] ?? booking.status}
                      </span>
                    </div>
                    <p className="text-xs text-[#7A6E65]">
                      {booking.bookingPets.map((bp) => bp.pet.name).join(', ')}
                      {' · '}
                      {formatDateShort(booking.startDate, locale)}
                      {booking.endDate && ` → ${formatDateShort(booking.endDate, locale)}`}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Invoices — premium */}
      <div className="bg-white border border-[rgba(196,151,74,0.15)] rounded-2xl p-6 shadow-[0_4px_20px_rgba(196,151,74,0.08)]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-serif font-semibold text-[#1C1612]">{t('recentInvoices')}</h2>
          <Link href={`/${locale}/client/invoices`} className="text-sm text-[#C4974A] hover:text-[#9A7235] font-medium transition-colors">
            {t('viewAllInvoices')} →
          </Link>
        </div>
        {recentInvoices.length === 0 ? (
          <p className="text-sm text-[#7A6E65] text-center py-4">
            {locale === 'fr' ? 'Aucune facture' : 'No invoices'}
          </p>
        ) : (
          <div className="divide-y divide-[rgba(196,151,74,0.08)]">
            {recentInvoices.map((invoice) => {
              const isPaid = invoice.status === 'PAID';
              const badgeStyle = isPaid
                ? { bg: '#EAF7EF', color: '#1A7A45' }
                : { bg: '#FEF3E2', color: '#B45309' };
              return (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0 px-2 -mx-2 rounded-lg hover:bg-[rgba(196,151,74,0.04)] transition-colors"
                >
                  <div>
                    <p className="font-mono text-sm font-semibold text-[#9A7235]">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-[#8A7E75] mt-0.5">{formatDateShort(invoice.issuedAt, locale)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-[#1C1612]">{formatMAD(invoice.amount)}</span>
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium"
                      style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.color }}
                    >
                      {isPaid
                        ? <><CheckCircle className="h-3 w-3 mr-1 inline" />{locale === 'fr' ? 'Payée' : 'Paid'}</>
                        : <><AlertCircle className="h-3 w-3 mr-1 inline" />{locale === 'fr' ? 'En attente' : 'Pending'}</>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
