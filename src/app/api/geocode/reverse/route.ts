import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { cacheReadThrough } from '@/lib/cache';

// Reverse geocoding proxy → Nominatim (OpenStreetMap).
//
// Authenticated only: anonymous proxying would let any caller burn our
// 1 req/s fair-use budget against Nominatim. Rate-limited (30/h per user)
// at the middleware layer. Results cached 7 days in Redis keyed on
// rounded lat/lng (≈1m precision) so repeated lookups around the same
// pickup point are free.
const CACHE_TTL = 7 * 24 * 3600;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  const lang = (searchParams.get('lang') ?? 'fr').slice(0, 5);

  if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'INVALID_COORDS' }, { status: 400 });
  }

  // 6 decimals ≈ 0.11 m precision — good enough for cache hits on the same
  // building entrance but not so coarse it merges distinct pickup points.
  const lat6 = lat.toFixed(6);
  const lng6 = lng.toFixed(6);
  const cacheKey = `geocode:${lang}:${lat6}:${lng6}`;

  try {
    const result = await cacheReadThrough<{ address: string } | { error: string; status?: number }>(
      cacheKey,
      CACHE_TTL,
      async () => {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat6}&lon=${lng6}&accept-language=${encodeURIComponent(lang)}`,
          { headers: { 'User-Agent': 'DogUniverse/1.0 (contact@doguniverse.ma)' } },
        );
        if (!res.ok) {
          return { error: 'NOMINATIM_HTTP', status: res.status };
        }
        const data = await res.json();
        const address = typeof data?.display_name === 'string' ? data.display_name : null;
        if (!address) return { error: 'NO_ADDRESS' };
        return { address };
      },
    );

    if ('error' in result) {
      const status = result.error === 'NO_ADDRESS' ? 404 : 502;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'NOMINATIM_FETCH_FAILED', message: String(err) },
      { status: 502 },
    );
  }
}
