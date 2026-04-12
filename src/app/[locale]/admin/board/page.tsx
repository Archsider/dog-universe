import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import BoardView from './BoardView';

type Params = { locale: string };

export default async function BoardPage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    redirect(`/${locale}/auth/login`);
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { status: { in: ['PENDING', 'CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS'] } },
        { status: 'COMPLETED', updatedAt: { gte: sevenDaysAgo } },
      ],
    },
    include: {
      client: { select: { id: true, name: true, email: true } },
      bookingPets: {
        include: { pet: { select: { name: true, species: true } } },
      },
      boardingDetail: { select: { includeGrooming: true, taxiGoEnabled: true, taxiGoDate: true, taxiGoTime: true, taxiReturnEnabled: true, taxiReturnDate: true, taxiReturnTime: true } },
      taxiDetail: { select: { taxiType: true } },
    },
    orderBy: { startDate: 'asc' },
  });

  // Serialize for client component
  const serialized = bookings.map((b) => ({
    id: b.id,
    serviceType: b.serviceType as 'BOARDING' | 'PET_TAXI',
    status: b.status,
    startDate: b.startDate.toISOString(),
    endDate: b.endDate?.toISOString() ?? null,
    arrivalTime: b.arrivalTime ?? null,
    totalPrice: b.totalPrice,
    clientName: b.client.name ?? b.client.email,
    clientId: b.client.id,
    pets: b.bookingPets.map((bp) => ({ name: bp.pet.name, species: bp.pet.species })),
    taxiType: b.taxiDetail?.taxiType ?? null,
    includeGrooming: b.boardingDetail?.includeGrooming ?? false,
    taxiGoEnabled: b.boardingDetail?.taxiGoEnabled ?? false,
    taxiReturnEnabled: b.boardingDetail?.taxiReturnEnabled ?? false,
    notes: b.notes ?? null,
    updatedAt: (b as { updatedAt?: Date }).updatedAt?.toISOString() ?? b.startDate.toISOString(),
  }));

  // "En ce moment" stats
  const activeBoarders = bookings.filter(
    (b) =>
      b.serviceType === 'BOARDING' &&
      ['CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS'].includes(b.status) &&
      new Date(b.startDate) <= now &&
      (b.endDate ? new Date(b.endDate) >= todayStart : true)
  );

  const todayArrivals = bookings.filter(
    (b) =>
      b.serviceType === 'BOARDING' &&
      ['CONFIRMED', 'IN_PROGRESS', 'PENDING'].includes(b.status) &&
      new Date(b.startDate) >= todayStart &&
      new Date(b.startDate) <= todayEnd
  );

  const todayDepartures = bookings.filter(
    (b) =>
      b.serviceType === 'BOARDING' &&
      b.endDate &&
      new Date(b.endDate) >= todayStart &&
      new Date(b.endDate) <= todayEnd
  );

  // Upcoming departures: boardings ending in the next 7 days (tomorrow to day+7)
  const sevenDaysLater = new Date(todayStart);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  sevenDaysLater.setHours(23, 59, 59, 999);

  const upcomingDepartures = bookings
    .filter(
      (dep) =>
        dep.serviceType === 'BOARDING' &&
        dep.endDate &&
        ['CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS'].includes(dep.status) &&
        new Date(dep.endDate) > todayEnd &&
        new Date(dep.endDate) <= sevenDaysLater
    )
    .sort((dep1, dep2) => new Date(dep1.endDate!).getTime() - new Date(dep2.endDate!).getTime());

  // All boarding taxi add-ons (source unique: boardingDetail)
  const allBoardingTaxis: {
    bookingId: string;
    clientName: string;
    pets: string;
    direction: 'GO' | 'RETURN';
    time: string | null;
    date: string;
    bookingStartDate: string;
    bookingEndDate: string | null;
  }[] = [];

  for (const b of bookings) {
    if (b.serviceType !== 'BOARDING' || !b.boardingDetail) continue;
    const { boardingDetail } = b;
    const clientName = b.client.name ?? b.client.email;
    const pets = b.bookingPets.map((bp) => bp.pet.name).join(', ');
    if (boardingDetail.taxiGoEnabled) {
      allBoardingTaxis.push({
        bookingId: b.id,
        clientName,
        pets,
        direction: 'GO',
        time: boardingDetail.taxiGoTime ?? null,
        date: boardingDetail.taxiGoDate ?? b.startDate.toISOString(),
        bookingStartDate: b.startDate.toISOString(),
        bookingEndDate: b.endDate?.toISOString() ?? null,
      });
    }
    if (boardingDetail.taxiReturnEnabled) {
      const taxiReturnDate = boardingDetail.taxiReturnDate ?? b.endDate?.toISOString() ?? null;
      if (taxiReturnDate) {
        allBoardingTaxis.push({
          bookingId: b.id,
          clientName,
          pets,
          direction: 'RETURN',
          time: boardingDetail.taxiReturnTime ?? null,
          date: taxiReturnDate,
          bookingStartDate: b.startDate.toISOString(),
          bookingEndDate: b.endDate?.toISOString() ?? null,
        });
      }
    }
  }

  // Count taxi add-ons happening today
  const todayBoardingTaxisCount = allBoardingTaxis.filter((t) => {
    const d = new Date(t.date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === todayStart.getTime();
  }).length;

  const dogCount = activeBoarders.reduce(
    (sum, b) => sum + b.bookingPets.filter((bp) => bp.pet.species === 'DOG').length,
    0
  );
  const catCount = activeBoarders.reduce(
    (sum, b) => sum + b.bookingPets.filter((bp) => bp.pet.species === 'CAT').length,
    0
  );

  return (
    <BoardView
      locale={locale}
      bookings={serialized}
      stats={{
        activeBoarders: activeBoarders.length,
        dogCount,
        catCount,
        todayArrivals: todayArrivals.length,
        todayDepartures: todayDepartures.length,
        todayTaxis: todayBoardingTaxisCount,
        todayArrivalDetails: todayArrivals.map((b) => ({
          id: b.id,
          clientName: b.client.name ?? b.client.email,
          pets: b.bookingPets.map((bp) => bp.pet.name).join(', '),
          arrivalTime: b.arrivalTime ?? null,
        })),
        todayDepartureDetails: todayDepartures.map((b) => ({
          id: b.id,
          clientName: b.client.name ?? b.client.email,
          pets: b.bookingPets.map((bp) => bp.pet.name).join(', '),
        })),
        allBoardingTaxis,
        upcomingDepartureDetails: upcomingDepartures.map((dep) => ({
          id: dep.id,
          clientName: dep.client.name ?? dep.client.email,
          pets: dep.bookingPets.map((bp) => bp.pet.name).join(', '),
          endDate: dep.endDate!.toISOString(),
        })),
      }}
    />
  );
}
