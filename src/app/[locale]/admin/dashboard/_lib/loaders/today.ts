import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { startOfTodayCasa, endOfTodayCasa, casablancaYMD } from '@/lib/dates-casablanca';
import { notDeleted } from '@/lib/prisma-soft';
import { primarySpeciesOf, petNamesOf, type TodaySnapshot, type TodayMovement, type TodayTaxi } from '../shapes';

// TaxiTrip statuses that mean "done for today" — excluded from the dashboard
// widget. Anything else (PLANNED, EN_ROUTE_TO_CLIENT, ON_SITE_CLIENT,
// ANIMAL_ON_BOARD, EN_ROUTE_TO_DESTINATION, …) is considered active.
// Kept in sync with `HISTORY_TERMINAL_STATUSES` from
// src/lib/services/taxi-history.service.ts — the same "is this trip done?"
// definition is reused, so adding a new terminal there auto-flows here.
const TAXI_TERMINAL_STATUSES = [
  'ARRIVED_AT_PENSION',
  'ARRIVED_AT_CLIENT',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'NO_SHOW',
] as const;

export async function loadToday(): Promise<TodaySnapshot> {
  const todayStart = startOfTodayCasa();
  const todayEnd = endOfTodayCasa();
  // TaxiTrip.date is a `String?` stored as YYYY-MM-DD — compare as string,
  // not as a Date object (no UTC vs Casa drift possible).
  const { year, month, day } = casablancaYMD(todayStart);
  const todayYmd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const [checkInsRaw, checkOutsRaw, taxiTripsRaw] = await Promise.all([
    prisma.booking.findMany({
      where: notDeleted<Prisma.BookingWhereInput>({
        serviceType: 'BOARDING',
        status: { in: ['CONFIRMED', 'PENDING'] },
        startDate: { gte: todayStart, lte: todayEnd },
      }),
      select: {
        id: true,
        arrivalTime: true,
        client: { select: { name: true } },
        bookingPets: { select: { pet: { select: { name: true, species: true } } } },
      },
      orderBy: { arrivalTime: 'asc' },
      take: 20,
    }),
    prisma.booking.findMany({
      where: notDeleted<Prisma.BookingWhereInput>({
        serviceType: 'BOARDING',
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        endDate: { gte: todayStart, lte: todayEnd },
      }),
      select: {
        id: true,
        client: { select: { name: true } },
        bookingPets: { select: { pet: { select: { name: true, species: true } } } },
      },
      take: 20,
    }),
    // Pivot on TaxiTrip (NOT on Booking.serviceType='PET_TAXI'). Pre-PR #98
    // the dashboard counted only standalone PET_TAXI bookings and missed
    // every BOARDING-with-taxi-addon. Marie Lagarde (RETOUR) and the
    // Kabli pets (ALLER) were addon trips on BOARDING bookings → the
    // widget said "0 course" while Mehdi had 2 (then 3) scheduled.
    // Same fix shape as PR #68 for the driver dashboard.
    prisma.taxiTrip.findMany({
      where: {
        date: todayYmd,
        status: { notIn: [...TAXI_TERMINAL_STATUSES] },
        booking: notDeleted<Prisma.BookingWhereInput>({
          status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        }),
      },
      select: {
        id: true,
        tripType: true,
        time: true,
        address: true,
        booking: {
          select: {
            id: true,
            client: { select: { name: true } },
            bookingPets: { select: { pet: { select: { name: true } } } },
            // Fallback for STANDALONE legacy rows where TaxiTrip.address was
            // never populated. Schema has TaxiDetail (1-to-1 with Booking
            // when standalone) and BoardingDetail (1-to-1 when addon).
            taxiDetail: { select: { pickupAddress: true, dropoffAddress: true } },
            boardingDetail: { select: { taxiGoAddress: true, taxiReturnAddress: true } },
          },
        },
      },
      orderBy: { time: 'asc' },
      take: 20,
    }),
  ]);

  const checkIns: TodayMovement[] = checkInsRaw.map((b) => ({
    bookingId: b.id,
    clientName: b.client.name ?? '',
    petNames: petNamesOf(b.bookingPets),
    primaryPetSpecies: primarySpeciesOf(b.bookingPets),
    arrivalTime: b.arrivalTime,
  }));
  const checkOuts: TodayMovement[] = checkOutsRaw.map((b) => ({
    bookingId: b.id,
    clientName: b.client.name ?? '',
    petNames: petNamesOf(b.bookingPets),
    primaryPetSpecies: primarySpeciesOf(b.bookingPets),
    arrivalTime: null,
  }));
  const taxiRuns: TodayTaxi[] = taxiTripsRaw.map((t) => {
    const tt = t.tripType as 'OUTBOUND' | 'RETURN' | 'STANDALONE';
    const b = t.booking;
    // Address resolution depends on tripType :
    //  - OUTBOUND : pickup = chez client, dropoff = pension
    //  - RETURN   : pickup = pension, dropoff = chez client
    //  - STANDALONE : pickup = source, dropoff = destination
    // Source of truth : `TaxiTrip.address`. Fallback chains exist for
    // pre-Wave-1 rows that may have an empty address on the trip itself.
    let pickup: string | null = null;
    let dropoff: string | null = null;
    if (tt === 'STANDALONE') {
      pickup = t.address ?? b.taxiDetail?.pickupAddress ?? null;
      dropoff = b.taxiDetail?.dropoffAddress ?? null;
    } else if (tt === 'OUTBOUND') {
      pickup = t.address ?? b.boardingDetail?.taxiGoAddress ?? null;
      dropoff = null; // = pension, implicit
    } else {
      // RETURN
      pickup = null; // = pension, implicit
      dropoff = t.address ?? b.boardingDetail?.taxiReturnAddress ?? null;
    }
    return {
      tripId: t.id,
      bookingId: b.id,
      tripType: tt,
      clientName: b.client.name ?? '',
      petName: b.bookingPets[0]?.pet?.name ?? '',
      pickupAddress: pickup,
      dropoffAddress: dropoff,
      time: t.time ?? null,
    };
  });
  return { checkIns, checkOuts, taxiRuns };
}
