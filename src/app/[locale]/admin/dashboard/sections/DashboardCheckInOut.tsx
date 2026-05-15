import Link from 'next/link';
import { LogIn, LogOut } from 'lucide-react';
import { prisma } from '@/lib/prisma';

interface Props {
  locale: string;
  labels: { checkInsToday: string; checkOutsToday: string; noMovement: string };
}

export default async function DashboardCheckInOut({ locale, labels }: Props) {
  // Casa-anchored day boundaries — `new Date(now.getFullYear(), …)` on a
  // UTC runtime builds UTC midnight (= 01:00 Casa). Check-ins between
  // 00:00–01:00 Casa would be assigned to the previous day. Use the
  // explicit Casa helpers instead. See docs/BUSINESS_RULES.md §6.
  const { startOfTodayCasa, endOfTodayCasa } = await import('@/lib/dates-casablanca');
  const todayStart = startOfTodayCasa();
  const todayEnd = endOfTodayCasa();

  const [todayCheckIns, todayCheckOuts] = await Promise.all([
    prisma.booking.findMany({
      where: {
        serviceType: 'BOARDING',
        status: { in: ['CONFIRMED', 'PENDING'] },
        startDate: { gte: todayStart, lte: todayEnd },
        deletedAt: null,
      },
      select: {
        id: true,
        arrivalTime: true,
        client: { select: { name: true } },
        bookingPets: { select: { pet: { select: { name: true, species: true } } } },
      },
      orderBy: { arrivalTime: 'asc' },
    }),
    prisma.booking.findMany({
      where: {
        serviceType: 'BOARDING',
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        endDate: { gte: todayStart, lte: todayEnd },
        deletedAt: null,
      },
      select: {
        id: true,
        client: { select: { name: true } },
        bookingPets: { select: { pet: { select: { name: true, species: true } } } },
      },
    }),
  ]);

  if (todayCheckIns.length === 0 && todayCheckOuts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {/* Check-ins */}
      <div className="bg-white rounded-xl border border-green-200/60 p-5 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
            <LogIn className="h-4 w-4 text-green-600" />
          </div>
          <h2 className="font-semibold text-charcoal text-sm">{labels.checkInsToday}</h2>
          <span className="ml-auto text-xs font-bold text-green-700 bg-green-50 rounded-full px-2 py-0.5">
            {todayCheckIns.length}
          </span>
        </div>
        {todayCheckIns.length === 0 ? (
          <p className="text-xs text-gray-400">{labels.noMovement}</p>
        ) : (
          <div className="space-y-2">
            {todayCheckIns.map(b => (
              <Link key={b.id} href={`/${locale}/admin/reservations/${b.id}`}>
                <div className="flex items-center gap-2 py-1.5 hover:bg-ivory-50 -mx-2 px-2 rounded transition-colors">
                  <span className="text-base">{b.bookingPets[0]?.pet.species === 'CAT' ? '🐱' : '🐶'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate">
                      {b.bookingPets.map(bp => bp.pet.name).join(', ')}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{b.client.name}</p>
                  </div>
                  {b.arrivalTime && (
                    <span className="text-xs text-green-600 font-medium flex-shrink-0">{b.arrivalTime}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Check-outs */}
      <div className="bg-white rounded-xl border border-blue-200/60 p-5 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <LogOut className="h-4 w-4 text-blue-600" />
          </div>
          <h2 className="font-semibold text-charcoal text-sm">{labels.checkOutsToday}</h2>
          <span className="ml-auto text-xs font-bold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
            {todayCheckOuts.length}
          </span>
        </div>
        {todayCheckOuts.length === 0 ? (
          <p className="text-xs text-gray-400">{labels.noMovement}</p>
        ) : (
          <div className="space-y-2">
            {todayCheckOuts.map(b => (
              <Link key={b.id} href={`/${locale}/admin/reservations/${b.id}`}>
                <div className="flex items-center gap-2 py-1.5 hover:bg-ivory-50 -mx-2 px-2 rounded transition-colors">
                  <span className="text-base">{b.bookingPets[0]?.pet.species === 'CAT' ? '🐱' : '🐶'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate">
                      {b.bookingPets.map(bp => bp.pet.name).join(', ')}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{b.client.name}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
