import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getCapacityLimits, countOverlappingPets } from '@/lib/capacity';
import { findBoardingAlternatives } from '@/lib/capacity-alternatives';
import { startOfTodayCasa } from '@/lib/dates-casablanca';

// "Nearest available dates" for a full BOARDING window. Auth-gated (booking is
// a logged-in action) and bounded so an unauthenticated/abusive caller can't
// force a large fan-out of overlap queries.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NIGHTS = 90;
const MAX_PETS = 50;
const DAY_MS = 86_400_000;

function parseCount(raw: string | null, max: number): number | null {
  if (raw === null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > max) return null;
  return n;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const start = searchParams.get('start') ?? '';
  const end = searchParams.get('end') ?? '';
  const dogs = parseCount(searchParams.get('dogs'), MAX_PETS);
  const cats = parseCount(searchParams.get('cats'), MAX_PETS);

  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return NextResponse.json({ error: 'INVALID_DATE', message: 'start/end must be YYYY-MM-DD.' }, { status: 400 });
  }
  if (dogs === null || cats === null) {
    return NextResponse.json({ error: 'INVALID_PET_COUNT' }, { status: 400 });
  }
  if (dogs + cats === 0) {
    return NextResponse.json({ error: 'NO_PETS' }, { status: 400 });
  }

  // Mid-day anchors keep every shifted window on the intended Casa calendar day.
  const startDate = new Date(`${start}T12:00:00.000Z`);
  const endDate = new Date(`${end}T12:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'INVALID_DATE' }, { status: 400 });
  }
  const nights = Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS);
  if (nights <= 0 || nights > MAX_NIGHTS) {
    return NextResponse.json({ error: 'INVALID_RANGE', message: `Stay must be 1–${MAX_NIGHTS} nights.` }, { status: 400 });
  }

  const limits = await getCapacityLimits();

  // Does the requested window itself fit? (Cheap: 1–2 overlap counts.)
  const reqWindow = { startDate, endDate };
  const dogsThere = dogs > 0 ? await countOverlappingPets('DOG', reqWindow) : 0;
  const catsThere = cats > 0 ? await countOverlappingPets('CAT', reqWindow) : 0;
  const requestedFits =
    dogs <= limits.dogs - dogsThere && cats <= limits.cats - catsThere;

  // Only search alternatives when the requested dates are actually full.
  const alternatives = requestedFits
    ? []
    : await findBoardingAlternatives({
        newDogs: dogs,
        newCats: cats,
        startDate,
        endDate,
        limits,
        count: 3,
        searchRadiusDays: 14,
        earliestStart: startOfTodayCasa(),
      });

  return NextResponse.json({ requestedFits, nights, alternatives });
}
