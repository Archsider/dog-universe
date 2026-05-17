// Shape interfaces returned to the dashboard page.
//
// Lives outside `queries.ts` so the orchestrator stays minimal and each
// section loader under `./loaders/` can import only the shape it owns.
// Re-exported from `queries.ts` for backward-compat with the existing
// `_components/*.tsx` cards that already do
// `import type { PensionSnapshot } from '../_lib/queries'`.

import type { UpcomingBirthday, DayWindow } from './helpers';

export type { UpcomingBirthday } from './helpers';

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
  /** e.g. 'overpaid', 'payment_attribution_drift' — keys defined in health-invariants.ts */
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

// ─── Internal helpers shared between several loaders ────────────────

export function primarySpeciesOf(
  pets: ReadonlyArray<{ pet: { species: string } | null }>,
): 'DOG' | 'CAT' {
  // Defensive — pet can be soft-deleted (null) on legacy bookings.
  const first = pets.find((bp) => bp.pet != null);
  return first?.pet?.species === 'CAT' ? 'CAT' : 'DOG';
}

export function petNamesOf(
  pets: ReadonlyArray<{ pet: { name: string } | null }>,
): string[] {
  return pets.filter((bp) => bp.pet != null).map((bp) => bp.pet!.name);
}
