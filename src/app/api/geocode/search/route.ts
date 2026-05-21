import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { cacheReadThrough } from '@/lib/cache';

// Forward geocoding proxy → Nominatim (OpenStreetMap) search.
//
// Powers the address autocomplete in the booking wizard : the client types
// "Résidence Al Andalous" and gets real geocoded suggestions, far more
// precise than reverse-geocoding a pin dropped roughly on a map.
//
// Authenticated only (same rationale as /reverse — protect our 1 req/s
// Nominatim fair-use budget). Rate-limited (geocode bucket) at middleware.
// Results biased to Morocco + a Marrakech viewbox so local places rank
// first. Cached 24h in Redis keyed on the normalized query.
const CACHE_TTL = 24 * 3600;
const MIN_QUERY_LEN = 3;
const MAX_RESULTS = 6;

// Marrakech bounding box (lon_min, lat_max, lon_max, lat_min) — biases
// (not restricts) results toward the city. bounded=0 keeps national hits
// (airport, other cities) available but lower-ranked.
const MARRAKECH_VIEWBOX = '-8.10,31.72,-7.85,31.55';

export interface GeoSuggestion {
  label: string;
  lat: number;
  lng: number;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim().slice(0, 120);
  const lang = (searchParams.get('lang') ?? 'fr').slice(0, 5);

  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json({ suggestions: [] as GeoSuggestion[] });
  }

  const cacheKey = `geosearch:${lang}:${q.toLowerCase()}`;

  try {
    const result = await cacheReadThrough<{ suggestions: GeoSuggestion[] }>(
      cacheKey,
      CACHE_TTL,
      async () => {
        const url =
          `https://nominatim.openstreetmap.org/search?format=jsonv2` +
          `&q=${encodeURIComponent(q)}` +
          `&accept-language=${encodeURIComponent(lang)}` +
          `&countrycodes=ma&limit=${MAX_RESULTS}` +
          `&viewbox=${MARRAKECH_VIEWBOX}&bounded=0`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'DogUniverse/1.0 (contact@doguniverse.ma)' },
        });
        if (!res.ok) return { suggestions: [] };
        const data = await res.json();
        if (!Array.isArray(data)) return { suggestions: [] };
        const suggestions: GeoSuggestion[] = data
          .map((d: unknown) => {
            const row = d as { display_name?: unknown; lat?: unknown; lon?: unknown };
            const label = typeof row.display_name === 'string' ? row.display_name : null;
            const lat = typeof row.lat === 'string' ? parseFloat(row.lat) : NaN;
            const lng = typeof row.lon === 'string' ? parseFloat(row.lon) : NaN;
            if (!label || !isFinite(lat) || !isFinite(lng)) return null;
            return { label, lat, lng };
          })
          .filter((x): x is GeoSuggestion => x !== null);
        return { suggestions };
      },
    );

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'NOMINATIM_FETCH_FAILED', message: String(err), suggestions: [] },
      { status: 502 },
    );
  }
}
