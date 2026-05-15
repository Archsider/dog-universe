import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cacheReadThrough } from '@/lib/cache';
import { getCapacityLimits } from '@/lib/capacity';
import { getCasaStartOfDay, getCasaEndOfDay } from '@/lib/timezone';

// Edge / CDN caching — public route, varies on query string by default
export const revalidate = 60;

const MONTH_RE = /^\d{4}-\d{2}$/;
const VALID_SPECIES = ['DOG', 'CAT'] as const;
type Species = 'DOG' | 'CAT';

interface DayAvailability {
  date: string;
  booked: number;
  limit: number;
  available: number;
  status: 'available' | 'limited' | 'full';
}

interface AvailabilityResponse {
  species: Species;
  month: string;
  days: DayAvailability[];
}

function getStatus(available: number, limit: number): 'available' | 'limited' | 'full' {
  if (available === 0) return 'full';
  if (available <= Math.ceil(limit * 0.2)) return 'limited';
  return 'available';
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function computeAvailability(
  species: Species,
  month: string,
  limit: number,
): Promise<AvailabilityResponse> {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  // Month window in Casablanca local time. Without TZ adjustment, the first
  // day of the month near midnight could land on the previous month in UTC
  // and break the overlap query.
  const start = getCasaStartOfDay(new Date(year, monthNum - 1, 1, 12, 0, 0, 0));
  const end = getCasaEndOfDay(new Date(year, monthNum, 0, 12, 0, 0, 0));

  // Fetch all closed-range BOARDING bookings overlapping the month.
  // Open-ended bookings (isOpenEnded=true OR endDate=null) are intentionally
  // excluded — without a known checkout we can't project them on a calendar
  // without blocking all future dates. Admin manages overbooking manually
  // while an open-ended booking is in-house.
  const bookings = await prisma.booking.findMany({
    where: {
      serviceType: 'BOARDING',
      status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
      deletedAt: null,
      isOpenEnded: false,
      startDate: { lte: end },
      endDate: { gte: start, not: null },
    },
    select: {
      startDate: true,
      endDate: true,
      bookingPets: {
        select: { pet: { select: { species: true } } },
      },
    },
    take: 2000,
  });

  // Count only pets of the requested species per booking.
  const filtered = bookings.map((b) => ({
    startDate: b.startDate,
    endDate: b.endDate,
    petCount: b.bookingPets.filter((bp) => bp.pet.species === species).length,
  })).filter((b): b is { startDate: Date; endDate: Date; petCount: number } => b.endDate !== null && b.petCount > 0);

  // Build per-day availability
  const days: DayAvailability[] = [];
  const daysInMonth = end.getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, monthNum - 1, d);
    day.setHours(12, 0, 0, 0); // noon to avoid DST edge cases

    let booked = 0;
    for (const b of filtered) {
      // Align booking bounds to a Casablanca-local day so the overlap test
      // doesn't shift by an hour when the booking instant straddles UTC midnight.
      const bStart = getCasaStartOfDay(b.startDate);
      const bEnd = getCasaEndOfDay(b.endDate);
      if (bStart <= day && bEnd >= day) {
        booked += b.petCount;
      }
    }

    const available = Math.max(0, limit - booked);
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    days.push({
      date: dateStr,
      booked,
      limit,
      available,
      status: getStatus(available, limit),
    });
  }

  return { species, month, days };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const month = searchParams.get('month') ?? '';
  const speciesParam = searchParams.get('species') ?? undefined;

  // Validate month
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 });
  }

  // Clamp month to ±24 months around today. Prevents an attacker from
  // forcing the server to pre-compute and cache thousands of far-future or
  // ancient projections (cache pollution + DB load).
  {
    const [yStr, mStr] = month.split('-');
    const year = parseInt(yStr, 10);
    const monthNum = parseInt(mStr, 10);
    if (!Number.isFinite(year) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ error: 'INVALID_MONTH_RANGE' }, { status: 400 });
    }
    const requested = year * 12 + (monthNum - 1);
    // Casa-anchored "current month" — `now.getMonth()` on a UTC runtime
    // returns the previous Casa month at the boundary, allowing a request
    // for "Casa May" to be rejected as `>24` past UTC April when both are
    // valid Casa months. See docs/BUSINESS_RULES.md §6.
    const { currentMonthCasa } = await import('@/lib/dates-casablanca');
    const { year: cy, month: cm } = currentMonthCasa();
    const current = cy * 12 + (cm - 1);
    if (Math.abs(requested - current) > 24) {
      return NextResponse.json({ error: 'INVALID_MONTH_RANGE' }, { status: 400 });
    }
  }

  // Validate species
  if (speciesParam !== undefined && !VALID_SPECIES.includes(speciesParam as Species)) {
    return NextResponse.json({ error: 'Invalid species. Use DOG or CAT.' }, { status: 400 });
  }

  const species = (speciesParam as Species | undefined) ?? 'DOG';

  // Single cached read for capacity limits — shared across all availability
  // requests via the 5-min Redis cache in @/lib/capacity (vs the previous
  // per-call setting.findUnique which bypassed the cache).
  const limits = await getCapacityLimits();
  const limit = species === 'DOG' ? limits.dogs : limits.cats;

  const cacheKey = `availability:${species}:${month}`;
  const data = await cacheReadThrough<AvailabilityResponse>(cacheKey, 300, () =>
    computeAvailability(species, month, limit),
  );

  return NextResponse.json(data, {
    headers: {
      // CDN: serve cached for 60s, allow stale-while-revalidate up to 5 min
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
