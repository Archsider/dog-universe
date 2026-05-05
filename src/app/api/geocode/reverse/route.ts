import { NextRequest, NextResponse } from 'next/server';

// Reverse geocoding proxy → Nominatim (OpenStreetMap).
// Le fetch direct depuis le client peut échouer (CORS, ad-blockers, réseaux
// d'entreprise). On le fait côté serveur pour garantir la réponse.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  const lang = searchParams.get('lang') ?? 'fr';

  if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'INVALID_COORDS' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=${encodeURIComponent(lang)}`,
      { headers: { 'User-Agent': 'DogUniverse/1.0 (contact@doguniverse.ma)' } },
    );
    if (!res.ok) {
      return NextResponse.json({ error: 'NOMINATIM_HTTP', status: res.status }, { status: 502 });
    }
    const data = await res.json();
    const address = typeof data?.display_name === 'string' ? data.display_name : null;
    if (!address) {
      return NextResponse.json({ error: 'NO_ADDRESS' }, { status: 404 });
    }
    return NextResponse.json({ address });
  } catch (err) {
    return NextResponse.json(
      { error: 'NOMINATIM_FETCH_FAILED', message: String(err) },
      { status: 502 },
    );
  }
}
