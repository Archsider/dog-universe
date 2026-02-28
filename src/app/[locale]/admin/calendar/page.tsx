import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { CalendarGrid } from './CalendarGrid';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function AdminCalendarPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const sp = await searchParams;

  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const now = new Date();
  const year = parseInt(sp.year ?? String(now.getFullYear()));
  const month = parseInt(sp.month ?? String(now.getMonth() + 1)); // 1-based

  const firstDay = new Date(year, month - 1, 1);
  firstDay.setHours(0, 0, 0, 0);
  const lastDay = new Date(year, month, 0);
  lastDay.setHours(23, 59, 59, 999);

  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
      startDate: { lte: lastDay },
      OR: [
        { endDate: { gte: firstDay } },
        { endDate: null, startDate: { gte: firstDay } },
      ],
    },
    include: {
      client: { select: { name: true } },
      bookingPets: { include: { pet: { select: { name: true, species: true } } } },
    },
    orderBy: { startDate: 'asc' },
  });

  // Serialize dates for client component
  const serialized = bookings.map((b) => ({
    id: b.id,
    serviceType: b.serviceType,
    status: b.status,
    startDate: b.startDate.toISOString(),
    endDate: b.endDate ? b.endDate.toISOString() : null,
    client: { name: b.client.name },
    bookingPets: b.bookingPets.map((bp) => ({
      pet: { name: bp.pet.name, species: bp.pet.species },
    })),
  }));

  // Stats
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayBoardings = serialized.filter((b) => {
    if (b.serviceType !== 'BOARDING') return false;
    const start = new Date(b.startDate);
    start.setHours(0, 0, 0, 0);
    const end = b.endDate ? new Date(b.endDate) : null;
    if (end) end.setHours(23, 59, 59, 0);
    return start <= today && (!end || end >= today) && ['CONFIRMED', 'IN_PROGRESS'].includes(b.status);
  });

  const petsTodayCount = todayBoardings.reduce((acc, b) => acc + b.bookingPets.length, 0);
  const monthBoardings = serialized.filter((b) => b.serviceType === 'BOARDING' && ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(b.status)).length;

  const l = locale === 'en'
    ? { title: 'Boarding Calendar', todayLabel: "Today's boarders", monthLabel: 'Stays this month', petsLabel: 'animals' }
    : { title: 'Calendrier des séjours', todayLabel: "Pensionnaires aujourd'hui", monthLabel: 'Séjours ce mois', petsLabel: 'animaux' };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-ivory-200 shadow-sm px-5 py-4">
          <p className="text-xs text-charcoal/50 font-medium mb-1">{l.todayLabel}</p>
          <p className="text-3xl font-bold text-charcoal">{petsTodayCount}</p>
          <p className="text-xs text-charcoal/40 mt-0.5">{l.petsLabel}</p>
        </div>
        <div className="bg-white rounded-2xl border border-ivory-200 shadow-sm px-5 py-4">
          <p className="text-xs text-charcoal/50 font-medium mb-1">{l.monthLabel}</p>
          <p className="text-3xl font-bold text-charcoal">{monthBoardings}</p>
          <p className="text-xs text-charcoal/40 mt-0.5">boarding</p>
        </div>
      </div>

      <CalendarGrid year={year} month={month} locale={locale} bookings={serialized} />
    </div>
  );
}
