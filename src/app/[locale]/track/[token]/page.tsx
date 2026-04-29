'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Tuiles OpenStreetMap (whitelisted dans CSP middleware) — pas d'API key requise.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
// Fallback poll interval (used only if the SSE stream cannot be established
// — old browsers, blocked proxies, repeated server errors).
const FALLBACK_POLL_MS = 10_000;
// Threshold before we give up on SSE and switch to fallback polling.
const SSE_MAX_RECONNECT_ATTEMPTS = 3;

// Composants Leaflet : SSR off (Leaflet utilise window/document).
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr: false });
const Marker       = dynamic(() => import('react-leaflet').then(m => m.Marker),       { ssr: false });

interface TrackResponse {
  active?: boolean;
  lastLocation?: {
    lat: number;
    lng: number;
    heading: number | null;
    speed: number | null;
    createdAt: string;
  } | null;
  clientName?: string;
  petNames?: string;
  error?: string;
}

type LeafletDivIcon = unknown; // L.DivIcon importé dynamiquement à la volée

export default function TrackPage() {
  const params = useParams<{ locale: string; token: string }>();
  const locale = params?.locale === 'en' ? 'en' : 'fr';
  const isFr = locale === 'fr';
  const token = params?.token ?? '';

  const [data, setData] = useState<TrackResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'inactive' | 'notfound' | 'error'>('loading');
  const [carIcon, setCarIcon] = useState<LeafletDivIcon | null>(null);
  // Polling : setTimeout récursif (plus fiable que setInterval pour les requêtes lentes)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  // Refs impératifs Leaflet — la prop "position" du Marker peut ne pas
  // se réactualiser correctement en mode dynamic-import. On déplace le
  // marker et recentre la carte via setLatLng / flyTo à chaque update.
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);

  // Charge l'icône custom (divIcon = pas d'image externe — CSP-safe)
  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((L) => {
      if (cancelled) return;
      const icon = L.divIcon({
        html: '<div style="width:24px;height:24px;border-radius:50%;border:3px solid white;background:#C4974A;box-shadow:0 2px 12px rgba(196,151,74,0.6);"></div>',
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      setCarIcon(icon);
    });
    return () => { cancelled = true; };
  }, []);

  // Stratégie en deux étages :
  //  1. SSE (`/api/taxi/{token}/stream`) — push temps réel, EventSource gère
  //     la reconnexion auto. Au-delà de SSE_MAX_RECONNECT_ATTEMPTS échecs
  //     consécutifs (server errors, CSP, navigateur sans support), bascule.
  //  2. Fallback polling 10 s sur l'endpoint REST historique
  //     `/api/taxi-tracking/{token}` (toujours dispo).
  // Premier fetch REST une fois pour récupérer clientName/petNames + état
  // initial avant que le stream ne livre des positions.
  useEffect(() => {
    if (!token) return;
    let aborted = false;

    // Initial REST fetch: récupère le nom client/animaux (le stream ne les
    // envoie pas) + statut "active". Si 404 → notfound, on s'arrête.
    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/taxi-tracking/${token}`, { cache: 'no-store' });
        if (aborted) return false;
        if (res.status === 404) { setStatus('notfound'); return false; }
        if (!res.ok) { setStatus('error'); return false; }
        const json = (await res.json()) as TrackResponse;
        if (aborted) return false;
        setData(json);
        setStatus(json.active ? 'ok' : 'inactive');
        return json.active === true;
      } catch {
        if (!aborted) setStatus('error');
        return false;
      }
    };

    const startFallbackPolling = () => {
      const tick = async () => {
        if (aborted) return;
        try {
          const res = await fetch(`/api/taxi-tracking/${token}`, { cache: 'no-store' });
          if (aborted) return;
          if (res.status === 404) { setStatus('notfound'); return; }
          if (res.ok) {
            const json = (await res.json()) as TrackResponse;
            if (!aborted) {
              setData((prev) => ({ ...prev, ...json }));
              setStatus(json.active ? 'ok' : 'inactive');
            }
          }
        } catch { /* swallow — try again next tick */ }
        if (!aborted) {
          timeoutRef.current = setTimeout(tick, FALLBACK_POLL_MS);
        }
      };
      void tick();
    };

    const startSse = () => {
      if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
        startFallbackPolling();
        return;
      }
      let consecutiveErrors = 0;
      const es = new EventSource(`/api/taxi/${token}/stream`);
      eventSourceRef.current = es;

      es.addEventListener('connected', () => { consecutiveErrors = 0; });

      es.addEventListener('location', (ev) => {
        if (aborted) return;
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as {
            lat: number; lng: number; timestamp: number;
            heading?: number | null; speed?: number | null;
          };
          setData((prev) => ({
            ...prev,
            active: true,
            lastLocation: {
              lat: payload.lat,
              lng: payload.lng,
              heading: payload.heading ?? null,
              speed: payload.speed ?? null,
              createdAt: new Date(payload.timestamp).toISOString(),
            },
          }));
          setStatus('ok');
        } catch { /* malformed event — ignore */ }
      });

      es.addEventListener('completed', () => {
        if (aborted) return;
        setData((prev) => ({ ...prev, active: false }));
        setStatus('inactive');
        es.close();
      });

      es.onerror = () => {
        consecutiveErrors += 1;
        // EventSource will auto-reconnect; only escalate to polling fallback
        // when the connection has failed repeatedly. Server-side soft-timeouts
        // (~54 s) are normal reconnects and won't accumulate errors here.
        if (consecutiveErrors >= SSE_MAX_RECONNECT_ATTEMPTS) {
          es.close();
          eventSourceRef.current = null;
          if (!aborted) startFallbackPolling();
        }
      };
    };

    void (async () => {
      const isActive = await fetchOnce();
      if (aborted) return;
      if (isActive) startSse();
    })();

    return () => {
      aborted = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [token]);

  // Déplacement impératif du marker + auto-centrage carte (flyTo animé)
  // à chaque nouvelle position GPS.
  useEffect(() => {
    const loc = data?.lastLocation;
    if (!loc) return;
    const next: [number, number] = [loc.lat, loc.lng];
    if (markerRef.current) {
      markerRef.current.setLatLng(next);
    }
    if (mapRef.current) {
      mapRef.current.flyTo(next, 16, { duration: 1 });
    }
    // Volontairement deps minimales — re-render sur changement de coords seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.lastLocation?.lat, data?.lastLocation?.lng]);

  // ── Vues d'erreur / état ────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEFCF9] text-[#8A7E75]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-[#C4974A] border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">{isFr ? 'Chargement…' : 'Loading…'}</p>
        </div>
      </div>
    );
  }

  if (status === 'notfound') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEFCF9] px-6">
        <div className="text-center max-w-sm">
          <h1 className="font-serif text-2xl text-[#2A2520] mb-2">Dog Universe</h1>
          <p className="text-[#8A7E75]">
            {isFr ? 'Lien invalide ou expiré.' : 'Invalid or expired link.'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'inactive') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEFCF9] px-6">
        <div className="text-center max-w-sm">
          <h1 className="font-serif text-2xl text-[#2A2520] mb-2">Dog Universe</h1>
          <p className="text-[#8A7E75] text-sm leading-relaxed">
            {isFr
              ? "Le suivi GPS n'est pas actif pour cette course."
              : 'GPS tracking is not active for this trip.'}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FEFCF9] px-6">
        <div className="text-center max-w-sm">
          <p className="text-[#8A7E75] text-sm">
            {isFr ? 'Erreur réseau — nouvelle tentative dans quelques secondes…' : 'Network error — retrying in a few seconds…'}
          </p>
        </div>
      </div>
    );
  }

  const last = data?.lastLocation;
  const center: [number, number] = last ? [last.lat, last.lng] : [31.6295, -7.9811]; // Marrakech fallback
  const updatedAt = last ? new Date(last.createdAt).toLocaleTimeString(isFr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  return (
    <div className="min-h-screen flex flex-col bg-[#FEFCF9]">
      {/* Header */}
      <header className="px-4 py-3 sm:px-6 sm:py-4 bg-white border-b border-[rgba(196,151,74,0.2)] shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-base sm:text-lg font-bold text-[#2A2520] leading-tight">
              Dog Universe
            </h1>
            <p className="text-[10px] sm:text-xs text-[#C4974A] uppercase tracking-wider font-semibold">
              {isFr ? 'Suivi en direct' : 'Live tracking'}
            </p>
          </div>
          {data?.clientName && (
            <div className="text-right min-w-0">
              <p className="text-xs sm:text-sm font-medium text-[#2A2520] truncate">{data.clientName}</p>
              {data.petNames && (
                <p className="text-[10px] sm:text-xs text-[#8A7E75] truncate">🐾 {data.petNames}</p>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Carte */}
      <div className="flex-1 relative">
        {last ? (
          <MapContainer
            center={center}
            zoom={15}
            scrollWheelZoom
            style={{ height: '100%', width: '100%', minHeight: '60vh' }}
            ref={mapRef as never}
          >
            <TileLayer attribution={TILE_ATTRIB} url={TILE_URL} />
            <Marker
              position={center}
              ref={markerRef as never}
              {...(carIcon ? { icon: carIcon as never } : {})}
            />
          </MapContainer>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 gap-4">
            <div className="inline-block w-10 h-10 border-[3px] border-[#C4974A] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#7A6E65] text-sm">
              {isFr
                ? 'En attente de la position GPS…'
                : 'Waiting for GPS position…'}
            </p>
            <p className="text-[#8A7E75] text-xs">
              {isFr
                ? 'Le chauffeur active le suivi sur son téléphone.'
                : 'Driver is enabling tracking on their phone.'}
            </p>
          </div>
        )}
      </div>

      {/* Footer info */}
      {last && (
        <footer className="px-4 py-3 sm:px-6 sm:py-3 bg-white border-t border-[rgba(196,151,74,0.2)]">
          <div className="max-w-3xl mx-auto flex items-center justify-between text-xs text-[#8A7E75]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {isFr ? 'Mise à jour' : 'Updated'} : {updatedAt}
            </span>
            {typeof last.speed === 'number' && last.speed >= 0 && (
              <span>{Math.round(last.speed * 3.6)} km/h</span>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
