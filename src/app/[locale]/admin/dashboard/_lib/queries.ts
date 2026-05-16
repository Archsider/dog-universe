// Centralised DB layer for the cockpit dashboard. One function per UI
// section under `./loaders/`, all wired together here in
// `loadDashboardSnapshot()` so the page renders from a single Promise.all.
//
// Every Date boundary goes through the Casa helpers (`startOfTodayCasa`,
// `casablancaStartOfDay`, etc.). Re-introducing `.getMonth() / .getDate()`
// on a raw `new Date()` in any loader would silently shift queries by ±1
// day in production on the UTC Vercel runtime — see docs/BUSINESS_RULES.md §6.
//
// Each loader file owns one section :
//   - pension              : "Pension actuelle" — IN_PROGRESS strict counts
//   - pending              : "À valider" — count of PENDING bookings
//   - today                : Arrivals / Departures / Taxi runs today
//   - capacity-7d          : Next 7 days dog + cat capacity chart
//   - upcoming             : J → J+7 arrivals + departures (top 3 + totals)
//   - birthdays            : Pets with DOB in next 7 days
//   - vaccines             : Vaccination.nextDueDate in next 30 days
//   - long-stays           : IN_PROGRESS bookings > 21 days
//   - inactive             : CLIENT users idle > 180 days
//   - critical-invariants  : Last critical hits from Redis (fail-open)

import { loadPension } from './loaders/pension';
import { loadPending } from './loaders/pending';
import { loadToday } from './loaders/today';
import { loadCapacity7d } from './loaders/capacity-7d';
import { loadUpcoming } from './loaders/upcoming';
import { loadBirthdays } from './loaders/birthdays';
import { loadVaccines } from './loaders/vaccines';
import { loadLongStays } from './loaders/long-stays';
import { loadInactiveClients } from './loaders/inactive';
import { loadCriticalInvariants } from './loaders/critical-invariants';
import type { DashboardSnapshot } from './shapes';

// Re-export every snapshot type for back-compat with cards that already
// `import type { PensionSnapshot } from '../_lib/queries'`.
export type {
  PensionSnapshot,
  PendingSnapshot,
  TodayMovement,
  TodayTaxi,
  TodaySnapshot,
  DayCapacityPoint,
  SevenDayCapacitySnapshot,
  UpcomingMovement,
  UpcomingSnapshot,
  VaccineExpiry,
  LongStayItem,
  InactiveClient,
  CriticalInvariantHit,
  DashboardSnapshot,
  UpcomingBirthday,
} from './shapes';

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
