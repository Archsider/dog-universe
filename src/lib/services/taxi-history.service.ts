// /admin/driver — Historique chauffeur. Service pur (pas d'I/O Next, juste
// Prisma) qui répond à la question "donne-moi les courses qui matchent
// X filtres, paginées 20/page, triées par date décroissante". Utilisé par :
//
//   - GET /api/admin/taxi-trips/history       → JSON paginé pour l'UI
//   - GET /api/admin/taxi-trips/history/export → CSV (sans pagination, cap 5k)
//
// Pagination = cursor-based (id desc tie-break sur date+time). Plus stable
// que offset pour des datasets qui mutent en cours de navigation (ce qui est
// le cas ici : un trip peut bouger de statut pendant qu'on scrolle).

import { prisma } from '@/lib/prisma';

export type TripType = 'OUTBOUND' | 'RETURN' | 'STANDALONE';

// Statuts terminaux affichés dans Historique. Anything mid-flight (PLANNED,
// EN_ROUTE_TO_CLIENT, etc.) reste dans le Mode chauffeur. CANCELLED /
// REJECTED / NO_SHOW sont des terminaux "négatifs" qu'on inclut pour
// permettre à l'opérateur de chercher "j'ai annulé quelle course la semaine
// dernière ?".
export const HISTORY_TERMINAL_STATUSES = [
  'ARRIVED_AT_PENSION',
  'ARRIVED_AT_CLIENT',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'NO_SHOW',
] as const;
export type HistoryStatus = (typeof HISTORY_TERMINAL_STATUSES)[number];

export interface TaxiHistoryFilters {
  /** YYYY-MM-DD inclusive. Trip.date est une string YYYY-MM-DD. */
  from?: string;
  to?: string;
  clientId?: string;
  type?: TripType;
  status?: HistoryStatus;
}

export interface TaxiHistoryQuery extends TaxiHistoryFilters {
  /** Cursor = id du dernier trip de la page précédente. */
  cursor?: string;
  /** Defaults 20, max 100. */
  pageSize?: number;
}

export interface TaxiHistoryRow {
  id: string;
  bookingId: string;
  date: string | null;
  time: string | null;
  type: TripType;
  status: string;
  distanceKm: number;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  clientName: string | null;
  petNames: string[];
}

export interface TaxiHistoryPage {
  rows: TaxiHistoryRow[];
  nextCursor: string | null;
  totalCount: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
// Hard cap pour l'export CSV — au-delà l'export devient inutilisable pour
// l'opérateur ET le risque DoS/OOM Lambda monte. 5 000 lignes = ~ 5 ans à
// 3 courses/jour pour Dog Universe, largement suffisant pour un export
// ponctuel.
export const HISTORY_EXPORT_CAP = 5_000;

function buildWhere(filters: TaxiHistoryFilters) {
  const where: Record<string, unknown> = {};

  // Date range. Trip.date est une string ISO YYYY-MM-DD ; un compare
  // lexicographique fonctionne car ISO date strings sont triables.
  if (filters.from || filters.to) {
    const dateCondition: Record<string, string> = {};
    if (filters.from) dateCondition.gte = filters.from;
    if (filters.to) dateCondition.lte = filters.to;
    where.date = dateCondition;
  }

  // Type filter.
  if (filters.type) {
    where.tripType = filters.type;
  }

  // Status filter — explicite OU défaut sur tous les statuts terminaux.
  // On ne montre JAMAIS les statuts mid-flight dans l'Historique : ceux-là
  // restent dans le Mode chauffeur (séparation présente / passé claire).
  if (filters.status) {
    where.status = filters.status;
  } else {
    where.status = { in: [...HISTORY_TERMINAL_STATUSES] };
  }

  // Client filter — passe par la booking relation. Inclut un guard
  // deletedAt: null pour cacher les courses des clients soft-deleted.
  const bookingCondition: Record<string, unknown> = { deletedAt: null };
  if (filters.clientId) {
    bookingCondition.clientId = filters.clientId;
  }
  where.booking = bookingCondition;

  return where;
}

const TAXI_HISTORY_SELECT = {
  id: true,
  bookingId: true,
  date: true,
  time: true,
  tripType: true,
  status: true,
  distanceKm: true,
  address: true,
  booking: {
    select: {
      client: { select: { name: true } },
      bookingPets: { select: { pet: { select: { name: true } } } },
      taxiDetail: { select: { pickupAddress: true, dropoffAddress: true } },
      boardingDetail: {
        select: { taxiGoAddress: true, taxiReturnAddress: true },
      },
    },
  },
} as const;

// Resolved address depends on tripType — see /admin/driver/page.tsx pour la
// même logique sur la vue live. Centralisé ici pour éviter la drift.
//
// type Trip = Awaited<ReturnType<typeof prisma.taxiTrip.findMany<{ select: typeof TAXI_HISTORY_SELECT }>>>[number];
// (Type ré-écrit inline pour éviter une couche d'indirection lecture-difficile.)
interface TripRowFromPrisma {
  id: string;
  bookingId: string;
  date: string | null;
  time: string | null;
  tripType: string;
  status: string;
  distanceKm: number;
  address: string | null;
  booking: {
    client: { name: string | null };
    bookingPets: { pet: { name: string } | null }[];
    taxiDetail: {
      pickupAddress: string | null;
      dropoffAddress: string | null;
    } | null;
    boardingDetail: {
      taxiGoAddress: string | null;
      taxiReturnAddress: string | null;
    } | null;
  };
}

function resolvePickupAddress(trip: TripRowFromPrisma): string | null {
  if (trip.tripType === 'RETURN') {
    // Aller-retour pension : le départ est la pension, l'adresse de pickup
    // est l'adresse RETOUR (vers laquelle on emmène l'animal).
    return trip.booking.boardingDetail?.taxiReturnAddress ?? null;
  }
  return (
    trip.booking.taxiDetail?.pickupAddress ??
    trip.booking.boardingDetail?.taxiGoAddress ??
    trip.address ??
    null
  );
}

function resolveDropoffAddress(trip: TripRowFromPrisma): string | null {
  if (trip.tripType === 'RETURN') {
    return null; // Drop-off = pension, no client-facing address
  }
  return trip.booking.taxiDetail?.dropoffAddress ?? null;
}

function mapRow(trip: TripRowFromPrisma): TaxiHistoryRow {
  return {
    id: trip.id,
    bookingId: trip.bookingId,
    date: trip.date,
    time: trip.time,
    type: trip.tripType as TripType,
    status: trip.status,
    distanceKm: trip.distanceKm,
    pickupAddress: resolvePickupAddress(trip),
    dropoffAddress: resolveDropoffAddress(trip),
    clientName: trip.booking.client.name,
    petNames: trip.booking.bookingPets
      .map((bp) => bp.pet?.name)
      .filter((n): n is string => Boolean(n)),
  };
}

/**
 * Cursor-paginated taxi history. Default sort = `date desc, time desc, id desc`
 * (most recent first, id desc as tie-break to make the cursor unambiguous when
 * two trips share the same date+time).
 *
 * The `nextCursor` is the id of the LAST row of the current page. Pass it
 * back on the next call as `cursor` to get the next page.
 *
 * `totalCount` is a separate `count()` query — costs a row scan but lets the
 * UI display "X courses au total" without an extra round-trip. The combined
 * cost stays under ~50ms at our scale (few thousand trips per year).
 */
export async function getTaxiTripHistory(
  query: TaxiHistoryQuery,
): Promise<TaxiHistoryPage> {
  const pageSize = Math.min(
    Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const where = buildWhere(query);

  const [rows, totalCount] = await Promise.all([
    prisma.taxiTrip.findMany({
      where,
      select: TAXI_HISTORY_SELECT,
      orderBy: [{ date: 'desc' }, { time: 'desc' }, { id: 'desc' }],
      // Take pageSize + 1 to know if there's a next page without a second query.
      take: pageSize + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
    }),
    prisma.taxiTrip.count({ where }),
  ]);

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return {
    rows: page.map(mapRow),
    nextCursor,
    totalCount,
  };
}

/**
 * Returns ALL matching rows (capped at HISTORY_EXPORT_CAP) — for CSV export.
 * No pagination because the caller streams the result into a CSV body.
 */
export async function getTaxiTripHistoryForExport(
  filters: TaxiHistoryFilters,
): Promise<TaxiHistoryRow[]> {
  const where = buildWhere(filters);
  const rows = await prisma.taxiTrip.findMany({
    where,
    select: TAXI_HISTORY_SELECT,
    orderBy: [{ date: 'desc' }, { time: 'desc' }, { id: 'desc' }],
    take: HISTORY_EXPORT_CAP,
  });
  return rows.map(mapRow);
}
