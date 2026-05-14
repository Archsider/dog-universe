// Shared types + constants + pure helpers for the admin calendar grid.
// Centralised so each section file imports the same shape.

export interface BookingPet {
  pet: { name: string; species: string };
}

export interface CalendarBooking {
  id: string;
  serviceType: string;
  status: string;
  startDate: string;
  endDate: string | null;
  client: { name: string };
  bookingPets: BookingPet[];
  taxiGoEnabled?: boolean;
  taxiGoDate?: string | null;
  taxiGoTime?: string | null;
  taxiReturnEnabled?: boolean;
  taxiReturnDate?: string | null;
  taxiReturnTime?: string | null;
}

export interface TaxiDayEntry {
  bookingId: string;
  clientName: string;
  pets: string;
  direction: 'aller' | 'retour';
  time: string | null;
}

export const DAY_NAMES_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const DAY_NAMES_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
export const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const STATUS_CHIP: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  COMPLETED: 'bg-gray-100 text-gray-600 border-gray-200',
};

export const STATUS_LABEL_FR: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmé',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminé',
};
export const STATUS_LABEL_EN: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

/**
 * Returns true if the booking should appear on the given day cell.
 * - PET_TAXI: only on its startDate (single-day event).
 * - BOARDING: every day in the [startDate, endDate] range, inclusive.
 *   Open-ended stays (endDate=null) appear from startDate onwards forever.
 */
export function isBookingActiveOnDay(
  b: CalendarBooking,
  year: number,
  month: number,
  day: number,
): boolean {
  const dayDate = new Date(year, month - 1, day, 12, 0, 0);

  if (b.serviceType === 'PET_TAXI') {
    const start = new Date(b.startDate);
    return (
      start.getFullYear() === year &&
      start.getMonth() + 1 === month &&
      start.getDate() === day
    );
  }

  // BOARDING
  const start = new Date(b.startDate);
  start.setHours(0, 0, 0, 0);
  const end = b.endDate ? new Date(b.endDate) : null;
  if (end) end.setHours(23, 59, 59, 0);

  return start <= dayDate && (!end || end >= dayDate);
}

export interface PrecomputedMaps {
  /** Bookings active on each day (boarding + taxi). */
  dayBookingsMap: Map<number, CalendarBooking[]>;
  /** Booking IDs whose endDate falls on each day (departures). */
  dayDepartureIds: Map<number, Set<string>>;
  /** Booking IDs whose startDate falls on each day (arrivals). */
  dayArrivalIds: Map<number, Set<string>>;
  /** Pet-taxi addons (go/return) per day, with client + pets + time. */
  dayTaxiMap: Map<number, TaxiDayEntry[]>;
}

/**
 * Single pass over the bookings list to fill 4 indexes used by the
 * cell renderer. Doing this once at render-time avoids quadratic
 * scans inside the day-cell map.
 */
export function precomputeMaps(
  bookings: CalendarBooking[],
  year: number,
  month: number,
  daysInMonth: number,
): PrecomputedMaps {
  const dayBookingsMap = new Map<number, CalendarBooking[]>();
  for (let d = 1; d <= daysInMonth; d++) {
    const active = bookings.filter((b) => isBookingActiveOnDay(b, year, month, d));
    if (active.length > 0) dayBookingsMap.set(d, active);
  }

  const dayDepartureIds = new Map<number, Set<string>>();
  const dayArrivalIds = new Map<number, Set<string>>();
  for (const b of bookings) {
    if (b.serviceType !== 'BOARDING') continue;
    if (b.endDate) {
      const endD = new Date(b.endDate);
      if (endD.getFullYear() === year && endD.getMonth() + 1 === month) {
        const d = endD.getDate();
        const ids = dayDepartureIds.get(d) ?? new Set<string>();
        ids.add(b.id);
        dayDepartureIds.set(d, ids);
      }
    }
    const startD = new Date(b.startDate);
    if (startD.getFullYear() === year && startD.getMonth() + 1 === month) {
      const d = startD.getDate();
      const ids = dayArrivalIds.get(d) ?? new Set<string>();
      ids.add(b.id);
      dayArrivalIds.set(d, ids);
    }
  }

  const dayTaxiMap = new Map<number, TaxiDayEntry[]>();
  for (const b of bookings) {
    if (b.serviceType !== 'BOARDING') continue;
    const pets = b.bookingPets.map((bp) => bp.pet.name).join(', ');
    if (b.taxiGoEnabled) {
      const goDate = b.taxiGoDate ? new Date(b.taxiGoDate) : new Date(b.startDate);
      if (goDate.getFullYear() === year && goDate.getMonth() + 1 === month) {
        const d = goDate.getDate();
        const entries = dayTaxiMap.get(d) ?? [];
        entries.push({
          bookingId: b.id,
          clientName: b.client.name,
          pets,
          direction: 'aller',
          time: b.taxiGoTime ?? null,
        });
        dayTaxiMap.set(d, entries);
      }
    }
    if (b.taxiReturnEnabled) {
      const retDate = b.taxiReturnDate
        ? new Date(b.taxiReturnDate)
        : b.endDate
          ? new Date(b.endDate)
          : null;
      if (retDate && retDate.getFullYear() === year && retDate.getMonth() + 1 === month) {
        const d = retDate.getDate();
        const entries = dayTaxiMap.get(d) ?? [];
        entries.push({
          bookingId: b.id,
          clientName: b.client.name,
          pets,
          direction: 'retour',
          time: b.taxiReturnTime ?? null,
        });
        dayTaxiMap.set(d, entries);
      }
    }
  }

  return { dayBookingsMap, dayDepartureIds, dayArrivalIds, dayTaxiMap };
}
