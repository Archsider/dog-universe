// Centralised DB layer for the cockpit dashboard. One function per UI
// section, all wired together in `loadDashboardSnapshot()` so the page
// renders from a single Promise.all — caps + select shapes visible side
// by side, no N+1.
//
// Every Date boundary goes through the Casa helpers (`startOfTodayCasa`,
// `casablancaStartOfDay`, etc.). Re-introducing `.getMonth() / .getDate()`
// on a raw `new Date()` here would silently shift queries by ±1 day in
// production on the UTC Vercel runtime — see docs/BUSINESS_RULES.md §6.

import { addDays } from 'date-fns';
import { prisma } from '@/lib/prisma';
import {
  startOfTodayCasa,
  endOfTodayCasa,
  casablancaStartOfDay,
  casablancaYMD,
} from '@/lib/dates-casablanca';
import { getCapacityLimits, countOverlappingPets } from '@/lib/capacity';
import { nextSevenCasaDays, upcomingBirthdays, type DayWindow, type UpcomingBirthday } from './helpers';

// ─── Shapes returned to the page ─────────────────────────────────────

export interface PensionSnapshot {
  dogsIn: number;
  catsIn: number;
  dogsLimit: number;
  catsLimit: number;
}

export interface PendingSnapshot {
  count: number;
}

export interface TodayMovement {
  bookingId: string;
  clientName: string;
  petNames: string[];
  primaryPetSpecies: 'DOG' | 'CAT';
  arrivalTime: string | null;
}

export interface TodayTaxi {
  /** Stable per-trip key — multiple trips can share a booking (OUTBOUND + RETURN). */
  tripId: string;
  bookingId: string;
  /** OUTBOUND = aller (pickup chez client → dépose à la pension). RETURN = retour
   *  (pickup pension → dépose client). STANDALONE = course one-off (`Booking.serviceType=PET_TAXI`). */
  tripType: 'OUTBOUND' | 'RETURN' | 'STANDALONE';
  clientName: string;
  petName: string;
  /** From `TaxiTrip.address` first (source of truth per-trip) ; falls back to
   *  TaxiDetail.pickupAddress for STANDALONE legacy rows that never got their
   *  TaxiTrip.address backfilled. */
  pickupAddress: string | null;
  dropoffAddress: string | null;
  /** Scheduled time in HH:MM — comes from TaxiTrip.time, not booking.arrivalTime. */
  time: string | null;
}

export interface TodaySnapshot {
  checkIns: TodayMovement[];
  checkOuts: TodayMovement[];
  taxiRuns: TodayTaxi[];
}

export interface DayCapacityPoint extends DayWindow {
  dogsCount: number;
  catsCount: number;
}

export interface SevenDayCapacitySnapshot {
  days: DayCapacityPoint[];
  dogsLimit: number;
  catsLimit: number;
}

export interface UpcomingMovement {
  bookingId: string;
  clientName: string;
  petName: string;
  dateYmd: string; // Casa YYYY-MM-DD of the arrival / departure
}

export interface UpcomingSnapshot {
  arrivals: UpcomingMovement[];
  departures: UpcomingMovement[];
  totalArrivals: number;
  totalDepartures: number;
}

export interface VaccineExpiry {
  petName: string;
  ownerName: string;
  vaccineType: string;
  expiryYmd: string;
}

export interface LongStayItem {
  bookingId: string;
  petName: string;
  ownerName: string;
  ownerPhone: string | null;
  startDateYmd: string;
  daysInPension: number;
}

export interface InactiveClient {
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  lastPetName: string | null;
  lastInteractionYmd: string;
  daysSince: number;
}

export interface CriticalInvariantHit {
  /** e.g. 'overpaid', 'js_vs_mv_current_month' — keys defined in health-invariants.ts */
  key: string;
  label: string;
  count: number;
}

export interface DashboardSnapshot {
  pension: PensionSnapshot;
  pending: PendingSnapshot;
  today: TodaySnapshot;
  capacity7d: SevenDayCapacitySnapshot;
  upcoming: UpcomingSnapshot;
  birthdays: UpcomingBirthday[];
  vaccines: VaccineExpiry[];
  longStays: LongStayItem[];
  inactiveClients: InactiveClient[];
  criticalInvariants: CriticalInvariantHit[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

function primarySpeciesOf(pets: ReadonlyArray<{ pet: { species: string } | null }>): 'DOG' | 'CAT' {
  // Defensive — pet can be soft-deleted (null) on legacy bookings.
  const first = pets.find((bp) => bp.pet != null);
  return first?.pet?.species === 'CAT' ? 'CAT' : 'DOG';
}

function petNamesOf(pets: ReadonlyArray<{ pet: { name: string } | null }>): string[] {
  return pets.filter((bp) => bp.pet != null).map((bp) => bp.pet!.name);
}

// ─── Section loaders ─────────────────────────────────────────────────

async function loadPension(): Promise<PensionSnapshot> {
  // IN_PROGRESS strict, per Mehdi's brief : reflects the physical state of
  // the kennel (admin flips status manually at check-in). A CONFIRMED
  // overlapping today but not yet checked-in shows up in the "Aujourd'hui"
  // arrivals card instead — we don't double-count.
  const todayStart = startOfTodayCasa();
  const todayEnd = endOfTodayCasa();
  const [limits, dogsIn, catsIn] = await Promise.all([
    getCapacityLimits(),
    countOverlappingPets('DOG', { startDate: todayStart, endDate: todayEnd }),
    countOverlappingPets('CAT', { startDate: todayStart, endDate: todayEnd }),
  ]);
  // countOverlappingPets includes all ACTIVE_STATUSES (PENDING / CONFIRMED /
  // IN_PROGRESS) by design — for "Pension actuelle" we need IN_PROGRESS
  // strict, so we re-query directly. Simpler than parameterising the lib.
  const inProgress = await prisma.booking.findMany({
    where: {
      serviceType: 'BOARDING',
      status: 'IN_PROGRESS',
      deletedAt: null,
    },
    select: {
      bookingPets: {
        select: { pet: { select: { species: true } } },
      },
    },
  });
  let dogs = 0;
  let cats = 0;
  for (const b of inProgress) {
    for (const bp of b.bookingPets) {
      if (!bp.pet) continue;
      if (bp.pet.species === 'DOG') dogs++;
      else if (bp.pet.species === 'CAT') cats++;
    }
  }
  // dogsIn / catsIn from the lib are unused here but keep the call to
  // warm the Setting cache for the 7-day chart below (single round-trip).
  void dogsIn;
  void catsIn;
  return {
    dogsIn: dogs,
    catsIn: cats,
    dogsLimit: limits.dogs,
    catsLimit: limits.cats,
  };
}

async function loadPending(): Promise<PendingSnapshot> {
  const count = await prisma.booking.count({
    where: { status: 'PENDING', deletedAt: null },
  });
  return { count };
}

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

async function loadToday(): Promise<TodaySnapshot> {
  const todayStart = startOfTodayCasa();
  const todayEnd = endOfTodayCasa();
  // TaxiTrip.date is a `String?` stored as YYYY-MM-DD — compare as string,
  // not as a Date object (no UTC vs Casa drift possible).
  const { year, month, day } = casablancaYMD(todayStart);
  const todayYmd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const [checkInsRaw, checkOutsRaw, taxiTripsRaw] = await Promise.all([
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
      take: 20,
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
        booking: {
          status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
          deletedAt: null,
        },
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

async function loadCapacity7d(): Promise<SevenDayCapacitySnapshot> {
  const limits = await getCapacityLimits();
  const days = nextSevenCasaDays();
  // 14 lib calls (7 days × 2 species) in parallel — each hits the same
  // `Booking` index, the DB plan caches the join. Sub-100 ms aggregate
  // in practice on the prod dataset (~3k bookings).
  const counts = await Promise.all(
    days.flatMap((d) => [
      countOverlappingPets('DOG', { startDate: d.startUtc, endDate: d.endUtc }),
      countOverlappingPets('CAT', { startDate: d.startUtc, endDate: d.endUtc }),
    ]),
  );
  return {
    dogsLimit: limits.dogs,
    catsLimit: limits.cats,
    days: days.map((d, i) => ({
      ...d,
      dogsCount: counts[i * 2],
      catsCount: counts[i * 2 + 1],
    })),
  };
}

async function loadUpcoming(): Promise<UpcomingSnapshot> {
  const start = startOfTodayCasa();
  const horizon = new Date(start.getTime() + 7 * 86_400_000 - 1);
  const [arrivalsRaw, departuresRaw, totalArrivals, totalDepartures] = await Promise.all([
    prisma.booking.findMany({
      where: {
        serviceType: 'BOARDING',
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gte: start, lte: horizon },
        deletedAt: null,
      },
      select: {
        id: true,
        startDate: true,
        client: { select: { name: true } },
        bookingPets: { select: { pet: { select: { name: true } } } },
      },
      orderBy: { startDate: 'asc' },
      take: 3,
    }),
    prisma.booking.findMany({
      where: {
        serviceType: 'BOARDING',
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        endDate: { gte: start, lte: horizon },
        deletedAt: null,
      },
      select: {
        id: true,
        endDate: true,
        client: { select: { name: true } },
        bookingPets: { select: { pet: { select: { name: true } } } },
      },
      orderBy: { endDate: 'asc' },
      take: 3,
    }),
    prisma.booking.count({
      where: {
        serviceType: 'BOARDING',
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gte: start, lte: horizon },
        deletedAt: null,
      },
    }),
    prisma.booking.count({
      where: {
        serviceType: 'BOARDING',
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        endDate: { gte: start, lte: horizon },
        deletedAt: null,
      },
    }),
  ]);

  const ymdString = (d: Date | null): string => {
    if (!d) return '';
    const { year, month, day } = casablancaYMD(d);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const arrivals: UpcomingMovement[] = arrivalsRaw.map((b) => ({
    bookingId: b.id,
    clientName: b.client.name ?? '',
    petName: b.bookingPets[0]?.pet?.name ?? '',
    dateYmd: ymdString(b.startDate),
  }));
  const departures: UpcomingMovement[] = departuresRaw.map((b) => ({
    bookingId: b.id,
    clientName: b.client.name ?? '',
    petName: b.bookingPets[0]?.pet?.name ?? '',
    dateYmd: ymdString(b.endDate),
  }));

  return {
    arrivals,
    departures,
    totalArrivals,
    totalDepartures,
  };
}

async function loadBirthdays(): Promise<UpcomingBirthday[]> {
  // Cheapest path : pull every non-deleted pet with a DOB and filter in
  // JS. The total pet count is tiny (≤ a few hundred) ; saves a raw SQL
  // EXTRACT(MONTH) trip and keeps the helper pure-testable.
  const pets = await prisma.pet.findMany({
    where: {
      deletedAt: null,
      dateOfBirth: { not: null },
      // Walk-in pets often have sparse profiles ; exclude their owners
      // from anniversary surfacing — they aren't recurring relationships.
      owner: { isWalkIn: false, deletedAt: null },
    },
    select: {
      id: true,
      name: true,
      dateOfBirth: true,
      owner: { select: { name: true } },
    },
  });
  return upcomingBirthdays(pets);
}

async function loadVaccines(): Promise<VaccineExpiry[]> {
  const today = startOfTodayCasa();
  const horizon = new Date(today.getTime() + 30 * 86_400_000);
  const rows = await prisma.vaccination.findMany({
    where: {
      status: 'CONFIRMED',
      nextDueDate: { gte: today, lte: horizon },
      pet: { deletedAt: null, owner: { deletedAt: null, isWalkIn: false } },
    },
    select: {
      nextDueDate: true,
      vaccineType: true,
      pet: { select: { name: true, owner: { select: { name: true } } } },
    },
    orderBy: { nextDueDate: 'asc' },
    take: 10,
  });
  return rows
    .filter((r) => r.nextDueDate && r.pet)
    .map((r) => {
      const ymd = casablancaYMD(r.nextDueDate!);
      return {
        petName: r.pet!.name,
        ownerName: r.pet!.owner?.name ?? '',
        vaccineType: r.vaccineType,
        expiryYmd: `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`,
      };
    });
}

async function loadLongStays(): Promise<LongStayItem[]> {
  // IN_PROGRESS only, per brief. Boarding stays > 21 days that are
  // physically in the kennel — surface to the operator so they can
  // proactively reach out to the client via WhatsApp.
  const cutoff = casablancaStartOfDay(addDays(new Date(), -21));
  const rows = await prisma.booking.findMany({
    where: {
      serviceType: 'BOARDING',
      status: 'IN_PROGRESS',
      startDate: { lt: cutoff },
      deletedAt: null,
    },
    select: {
      id: true,
      startDate: true,
      client: { select: { name: true, phone: true } },
      bookingPets: { select: { pet: { select: { name: true } } } },
    },
    orderBy: { startDate: 'asc' },
    take: 5,
  });
  return rows.map((b) => {
    const ymd = casablancaYMD(b.startDate);
    const start = casablancaStartOfDay(b.startDate);
    const today = startOfTodayCasa();
    const daysIn = Math.round((today.getTime() - start.getTime()) / 86_400_000);
    return {
      bookingId: b.id,
      petName: b.bookingPets[0]?.pet?.name ?? '',
      ownerName: b.client.name ?? '',
      ownerPhone: b.client.phone,
      startDateYmd: `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`,
      daysInPension: daysIn,
    };
  });
}

async function loadInactiveClients(): Promise<InactiveClient[]> {
  // Activity metric per Mehdi : max(lastBooking.startDate, lastPayment
  // .paymentDate). Anything older than 6 months → at-risk. Walk-in
  // clients excluded (they're one-shot). Limit to 3 for the dashboard
  // panel ; sidebar already exposes /admin/clients for the full list.
  const cutoff = casablancaStartOfDay(addDays(new Date(), -180));
  // Pull candidate clients with their last booking and last payment in
  // one query each, then merge in JS.
  const clients = await prisma.user.findMany({
    where: {
      role: 'CLIENT',
      isWalkIn: false,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      bookings: {
        where: { deletedAt: null },
        select: {
          startDate: true,
          bookingPets: { select: { pet: { select: { name: true } } } },
        },
        orderBy: { startDate: 'desc' },
        take: 1,
      },
      invoices: {
        select: {
          payments: {
            select: { paymentDate: true },
            orderBy: { paymentDate: 'desc' },
            take: 1,
          },
        },
        orderBy: { issuedAt: 'desc' },
        take: 1,
      },
    },
  });

  const enriched = clients
    .map((c) => {
      const lastBooking = c.bookings[0]?.startDate ?? null;
      const lastPaymentRows = c.invoices.flatMap((inv) => inv.payments.map((p) => p.paymentDate));
      const lastPayment = lastPaymentRows.length > 0 ? lastPaymentRows[0] : null;
      const lastInteraction = [lastBooking, lastPayment]
        .filter((d): d is Date => d != null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const lastPetName = c.bookings[0]?.bookingPets[0]?.pet?.name ?? null;
      return { client: c, lastInteraction, lastPetName };
    })
    .filter((row) => row.lastInteraction != null && row.lastInteraction.getTime() < cutoff.getTime())
    .sort((a, b) => a.lastInteraction!.getTime() - b.lastInteraction!.getTime())
    .slice(0, 3);

  return enriched.map((row) => {
    const lastDate = row.lastInteraction!;
    const ymd = casablancaYMD(lastDate);
    const days = Math.round((startOfTodayCasa().getTime() - casablancaStartOfDay(lastDate).getTime()) / 86_400_000);
    return {
      clientId: row.client.id,
      clientName: row.client.name ?? '',
      clientPhone: row.client.phone,
      lastPetName: row.lastPetName,
      lastInteractionYmd: `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`,
      daysSince: days,
    };
  });
}

async function loadCriticalInvariants(): Promise<CriticalInvariantHit[]> {
  // Reads the Redis snapshots written by the hourly `invariants-check`
  // cron (see /admin/guardian/invariants). Surfaces ONLY the critical
  // severities with count > 0 — warnings ride the daily email digest.
  // Fail-open : Redis down → empty list, no banner shown.
  try {
    const { cacheGet } = await import('@/lib/cache');
    const knownKeys = [
      'overpaid',
      'negative_stock',
      'item_total_drift',
      'invoice_amount_drift',
      'allocated_sum_vs_paid',
      'payment_sum_vs_paid',
      'item_allocated_overflow',
      'fully_paid_missing_paidat',
      'mv_refresh_stale',
      'js_vs_mv_current_month',
    ] as const;
    const raws = await Promise.all(
      knownKeys.map((k) => cacheGet<{ count: number; label: string; severity: string } | null>(`invariant:last:${k}`)),
    );
    const hits: CriticalInvariantHit[] = [];
    raws.forEach((raw, i) => {
      if (!raw) return;
      let parsed: { count: number; label: string; severity: string };
      try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        return;
      }
      if (parsed.severity === 'critical' && parsed.count > 0) {
        hits.push({ key: knownKeys[i], label: parsed.label, count: parsed.count });
      }
    });
    return hits;
  } catch {
    return [];
  }
}

// ─── Orchestrator ────────────────────────────────────────────────────

export async function loadDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [
    pension,
    pending,
    today,
    capacity7d,
    upcoming,
    birthdays,
    vaccines,
    longStays,
    inactiveClients,
    criticalInvariants,
  ] = await Promise.all([
    loadPension(),
    loadPending(),
    loadToday(),
    loadCapacity7d(),
    loadUpcoming(),
    loadBirthdays(),
    loadVaccines(),
    loadLongStays(),
    loadInactiveClients(),
    loadCriticalInvariants(),
  ]);
  return {
    pension,
    pending,
    today,
    capacity7d,
    upcoming,
    birthdays,
    vaccines,
    longStays,
    inactiveClients,
    criticalInvariants,
  };
}
