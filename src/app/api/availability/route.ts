import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cacheReadThrough } from '@/lib/cache';

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

async function computeAvailability(species: Species, month: string): Promise<AvailabilityResponse> {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  const start = new Date(year, monthNum - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, monthNum, 0);
  end.setHours(23, 59, 59, 999);

  // Get capacity limit for this species
  const settingKey = species === 'DOG' ? 'capacity_dog' : 'capacity_cat';
  const settingRow = await prisma.setting.findUnique({ where: { key: settingKey } });
  const limit = settingRow ? parseInt(settingRow.value, 10) : (species === 'DOG' ? 20 : 10);

  // Fetch all BOARDING bookings overlapping the month
  const bookings = await prisma.booking.findMany({
    where: {
      serviceType: 'BOARDING',
      status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
      startDate: { lte: end },
      endDate: { gte: start },
      deletedAt: null,
    },
    select: {
      startDate: true,
      endDate: true,
      bookingPets: {
        select: { pet: { select: { species: true } } },
      },
    },
  });

  // Count only pets of the requested species per booking
  const filtered = bookings.map((b) => ({
    startDate: b.startDate,
    endDate: b.endDate!,
    petCount: b.bookingPets.filter((bp) => bp.pet.species === species).length,
  })).filter((b) => b.petCount > 0);

  // Build per-day availability
  const days: DayAvailability[] = [];
  const daysInMonth = end.getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, monthNum - 1, d);
    day.setHours(12, 0, 0, 0); // noon to avoid DST edge cases

    let booked = 0;
    for (const b of filtered) {
      const bStart = new Date(b.startDate);
      bStart.setHours(0, 0, 0, 0);
      const bEnd = new Date(b.endDate);
      bEnd.setHours(23, 59, 59, 999);
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

  // Validate species
  if (speciesParam !== undefined && !VALID_SPECIES.includes(speciesParam as Species)) {
    return NextResponse.json({ error: 'Invalid species. Use DOG or CAT.' }, { status: 400 });
  }

  const species = (speciesParam as Species | undefined) ?? 'DOG';

  const cacheKey = `availability:${species}:${month}`;
  const data = await cacheReadThrough<AvailabilityResponse>(cacheKey, 300, () =>
    computeAvailability(species, month),
  );

  return NextResponse.json(data);
}
