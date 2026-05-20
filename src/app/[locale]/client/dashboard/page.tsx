import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import Image from 'next/image';
import { MemberCard } from '@/components/shared/MemberCard';
import { Grade } from '@/lib/loyalty';
import { PawPrint, Calendar, FileText, History, CheckCircle, AlertCircle } from 'lucide-react';
import { formatDateShort, formatMAD } from '@/lib/utils';
import { RebookButton } from '@/components/client/RebookButton';
import { waLink } from '@/lib/whatsapp';
import { notDeleted } from '@/lib/prisma-soft';
import { startOfTodayCasa, daysUntilCasablanca } from '@/lib/dates-casablanca';
import { buildGreeting } from './_lib/greeting';
import TierUpCelebration from '@/components/client/TierUpCelebration';
import HolographicWrapper from '@/components/shared/HolographicWrapper';
import GreetingHeader from '@/components/shared/GreetingHeader';

type Params = { locale: string };

export default async function ClientDashboard({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations('dashboard');

  const [pets, upcomingBookings, recentInvoices, loyaltyGrade, myClaims] = await Promise.all([
    prisma.pet.findMany({
      where: notDeleted({ ownerId: session.user.id }),
      select: { id: true, name: true, species: true, breed: true, photoUrl: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.booking.findMany({
      where: {
        ...notDeleted(),
        clientId: session.user.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gte: startOfTodayCasa() },
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

  const [totalStays, totalSpent, lastBooking, waSetting, lastLoyaltyNotif] = await Promise.all([
    prisma.booking.count({ where: notDeleted({ clientId: session.user.id, status: 'COMPLETED' }) }),
    prisma.invoice.aggregate({ where: { clientId: session.user.id, status: 'PAID' }, _sum: { amount: true } }),
    prisma.booking.findFirst({
      where: notDeleted({ clientId: session.user.id, status: 'COMPLETED' }),
      orderBy: { endDate: 'desc' },
      select: {
        id: true,
        serviceType: true,
        totalPrice: true,
        bookingPets: { select: { pet: { select: { id: true, name: true } } } },
      },
    }),
    prisma.setting.findUnique({ where: { key: 'whatsapp_number' } }),
    // Most recent LOYALTY_UPDATE — fuels the tier-up celebration modal.
    prisma.notification.findFirst({
      where: { userId: session.user.id, type: 'LOYALTY_UPDATE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, read: true },
    }),
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
    ar: { PENDING: 'قيد الانتظار', CONFIRMED: 'مؤكد', COMPLETED: 'منتهي', CANCELLED: 'ملغى' },
  };
  const serviceLabels: Record<string, Record<string, string>> = {
    fr: { BOARDING: 'Pension', PET_TAXI: 'Taxi animalier' },
    en: { BOARDING: 'Boarding', PET_TAXI: 'Pet Taxi' },
    ar: { BOARDING: 'نزالة', PET_TAXI: 'سيارة أجرة للحيوانات' },
  };

  const dashboardStats = [
    { label: t('stats.pets'), value: pets.length, gold: false },
    { label: t('stats.totalStays'), value: totalStays, gold: false },
    { label: t('stats.totalSpent'), value: formatMAD(totalSpent._sum.amount ?? 0), gold: true },
  ];

  const quickActions = [
    { href: `/${locale}/client/bookings/new`, label: t('quickActions.book'), icon: Calendar },
    { href: `/${locale}/client/pets`, label: t('quickActions.myPets'), icon: PawPrint },
    { href: `/${locale}/client/invoices`, label: t('quickActions.invoices'), icon: FileText },
    { href: `/${locale}/client/history`, label: t('quickActions.history'), icon: History },
  ];

  const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
    CONFIRMED: { bg: '#EAF7EF', color: '#1A7A45' },
    PENDING: { bg: '#FEF3E2', color: '#B45309' },
    COMPLETED: { bg: '#F0EFFE', color: '#5B4FCF' },
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Tier-up celebration (Feature #2 Wave 5).  No-op when no unread
          loyalty notif < 7d — pure client-side gate. */}
      <TierUpCelebration
        grade={grade}
        locale={locale}
        lastLoyaltyNotification={lastLoyaltyNotif ? {
          id: lastLoyaltyNotif.id,
          createdAt: lastLoyaltyNotif.createdAt.toISOString(),
          read: lastLoyaltyNotif.read,
        } : null}
      />

      {/* Greeting — contextual (Wave 5 / UX classe mondiale). */}
      {(() => {
        const greeting = buildGreeting({
          locale,
          nextBooking: upcomingBookings[0]
            ? {
                serviceType: upcomingBookings[0].serviceType as 'BOARDING' | 'PET_TAXI',
                startDate: upcomingBookings[0].startDate,
                status: upcomingBookings[0].status,
                firstPetName: upcomingBookings[0].bookingPets?.[0]?.pet?.name ?? null,
              }
            : null,
          lastCompletedBooking: lastBooking
            ? { endDate: null, firstPetName: lastBooking.bookingPets?.[0]?.pet?.name ?? null }
            : null,
        });
        const upcomingBoarding = upcomingBookings[0];
        const days = upcomingBoarding
          ? Math.max(0, daysUntilCasablanca(upcomingBoarding.startDate))
          : null;
        return (
          <GreetingHeader
            salutation={greeting.salutation}
            firstName={firstName}
            lastName={lastName}
            subtitle={greeting.subtitle}
            variant="light"
            countdown={days !== null && upcomingBoarding && upcomingBoarding.status !== 'IN_PROGRESS'
              ? { days, petName: upcomingBoarding.bookingPets?.[0]?.pet?.name ?? null, locale }
              : undefined}
          />
        );
      })()}
      {/* End greeting */}
      <div className="hidden">{t('subtitle')}</div>

      {/* Member Card — wrapper shadow + border doré.  Cannot wrap in a Link
          because MemberCard contains interactive "Réclamer" buttons that
          would otherwise trigger nested-anchor navigation.  Instead, a
          dedicated CTA below points to the standalone /client/card page
          (Feature #2 — wallet-like shortcut). */}
      <HolographicWrapper holographic={grade === 'PLATINUM'} className="rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(196,151,74,0.12)] border border-[rgba(196,151,74,0.2)]">
        <MemberCard
          clientId={session.user.id}
          clientName={session.user.name ?? ''}
          pets={pets.map((p) => ({ name: p.name, species: p.species }))}
          grade={grade}
          totalStays={totalStays}
          totalSpentMAD={Number(totalSpent._sum.amount ?? 0)}
          locale={locale}
          claims={myClaims as { benefitKey: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' }[]}
        />
      </HolographicWrapper>

      <Link
        href={`/${locale}/client/card`}
        className="block text-center text-sm font-medium text-[#C4974A] hover:text-[#8B6914] transition-colors py-2"
      >
        {locale === 'fr' ? 'Ouvrir ma carte en plein écran →' : locale === 'ar' ? 'فتح بطاقتي بملء الشاشة ←' : 'Open my card full-screen →'}
      </Link>

      {/* Year Wrapped link (Feature #7 Wave 5) — visible only for clients
          with at least 1 stay this year ; otherwise the page would be a
          dead-end empty state. */}
      {totalStays > 0 && (
        <Link
          href={`/${locale}/client/wrapped`}
          className="block rounded-2xl border-2 border-[#D4AF37]/30 bg-gradient-to-br from-[#141428] to-[#0A0A1F] p-4 hover:border-[#D4AF37]/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden>🎉</span>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-[2px] text-[#D4AF37] font-semibold">
                {locale === 'fr' ? 'Votre année en résumé' : locale === 'ar' ? 'سنتك في ملخص' : 'Your year in review'}
              </p>
              <p className="text-sm text-[#F5EDD8] font-medium mt-0.5">
                Dog Universe Wrapped
              </p>
            </div>
            <span className="text-[#D4AF37]/60">→</span>
          </div>
        </Link>
      )}

      {/* Loyalty progress bar with paws */}
      {nextTier && (
        <div className="bg-white border border-[rgba(196,151,74,0.15)] rounded-2xl p-5 shadow-[0_4px_20px_rgba(196,151,74,0.08)]">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[11px] uppercase tracking-[1.5px] text-[#8A7E75]">
              {locale === 'fr' ? 'Progression fidélité' : locale === 'ar' ? 'تقدم الولاء' : 'Loyalty progress'}
            </span>
            <span className="text-[11px] text-[#C4974A]">
              {locale === 'fr'
                ? `${remainingStays} séjour${remainingStays > 1 ? 's' : ''} pour ${nextTier.label}`
                : locale === 'ar'
                ? `${remainingStays} إقامة للوصول إلى ${nextTier.label}`
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
        {dashboardStats.map((stat, i) => (
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
          {locale === 'fr' ? 'Actions rapides' : locale === 'ar' ? 'إجراءات سريعة' : 'Quick Actions'}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => {
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
                {locale === 'fr' ? 'Aucun animal enregistré' : locale === 'ar' ? 'لا توجد حيوانات مسجلة' : 'No pets registered'}
              </p>
              <Link href={`/${locale}/client/pets/new`} className="text-sm text-[#C4974A] font-medium mt-1 inline-block">
                + {locale === 'fr' ? 'Ajouter un animal' : locale === 'ar' ? 'إضافة حيوان' : 'Add a pet'}
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
                      <Image src={pet.photoUrl} alt={pet.name} width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <PawPrint className="h-5 w-5 text-[#C4974A]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#1C1612] text-sm">{pet.name}</p>
                    <p className="text-xs text-[#8A7E75]">
                      {pet.breed ?? (locale === 'fr' ? (pet.species === 'DOG' ? 'Chien' : 'Chat') : locale === 'ar' ? (pet.species === 'DOG' ? 'كلب' : 'قطة') : pet.species.toLowerCase())}
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
                const statusStyle = STATUS_STYLES[booking.status] ?? { bg: '#F5F5F5', color: '#6B6B6B' };
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

      {/* Rebook — last completed booking */}
      {lastBooking && (
        <div className="bg-white border border-[rgba(196,151,74,0.15)] rounded-2xl p-6 shadow-[0_4px_20px_rgba(196,151,74,0.08)]">
          <h2 className="text-xl font-serif font-semibold text-[#1C1612] mb-4">
            {locale === 'fr' ? 'Réserver à nouveau' : locale === 'ar' ? 'احجز مجددًا' : 'Book again'}
          </h2>
          <RebookButton
            booking={{
              id: lastBooking.id,
              serviceType: lastBooking.serviceType as 'BOARDING' | 'PET_TAXI',
              bookingPets: lastBooking.bookingPets,
              totalPrice: Number(lastBooking.totalPrice),
            }}
            locale={locale}
          />
        </div>
      )}

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
            {locale === 'fr' ? 'Aucune facture' : locale === 'ar' ? 'لا توجد فواتير' : 'No invoices'}
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
                        ? <><CheckCircle className="h-3 w-3 mr-1 inline" />{locale === 'fr' ? 'Payée' : locale === 'ar' ? 'مدفوعة' : 'Paid'}</>
                        : <><AlertCircle className="h-3 w-3 mr-1 inline" />{locale === 'fr' ? 'En attente' : locale === 'ar' ? 'معلقة' : 'Pending'}</>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* WhatsApp contact — only shown when whatsapp_number setting is configured */}
      {(() => {
        const waHref = waLink(
          waSetting?.value ?? null,
          locale === 'fr'
            ? 'Bonjour, je souhaite avoir des informations sur Dog Universe.'
            : locale === 'ar'
            ? 'مرحباً، أود الحصول على معلومات حول Dog Universe.'
            : 'Hello, I would like to get information about Dog Universe.',
        );
        if (!waHref) return null;
        return (
          <div className="flex justify-center">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300 transition-colors font-medium text-sm shadow-sm"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              {locale === 'fr' ? 'Nous contacter sur WhatsApp' : locale === 'ar' ? 'تواصل معنا على واتساب' : 'Contact us on WhatsApp'}
            </a>
          </div>
        );
      })()}
    </div>
  );
}
