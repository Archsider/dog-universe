'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Tuiles OpenStreetMap (whitelisted dans CSP middleware) — pas d'API key requise.
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const POLL_MS = 3000;

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Refs impératifs Leaflet — la prop "position" du Marker peut ne pas
  // se réactualiser correctement en mode dynamic-import. On déplace le
  // marker et recentre la carte via setLatLng / setView à chaque update.
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);

  // Charge l'icône custom (divIcon = pas d'image externe — CSP-safe)
  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((L) => {
      if (cancelled) return;
      const icon = L.divIcon({
        html: '<div style="width:52px;height:52px;border-radius:50%;border:2.5px solid #C4974A;background:white;box-shadow:0 2px 12px rgba(196,151,74,0.4);overflow:hidden;display:flex;align-items:center;justify-content:center;"><img src="/images/mascotte-assise.webp" alt="" style="width:44px;height:44px;object-fit:contain;" /></div>',
        className: 'mascotte-bounce',
        iconSize: [52, 52],
        iconAnchor: [26, 26],
      });
      setCarIcon(icon);
    });
    return () => { cancelled = true; };
  }, []);

  // Fetch initial + polling 5s
  useEffect(() => {
    if (!token) return;
    let aborted = false;

    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/taxi-tracking/${token}`, { cache: 'no-store' });
        if (aborted) return;
        if (res.status === 404) {
          setStatus('notfound');
          if (intervalRef.current) clearInterval(intervalRef.current);
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        const json = (await res.json()) as TrackResponse;
        if (aborted) return;
        setData(json);
        setStatus(json.active ? 'ok' : 'inactive');
      } catch {
        if (!aborted) setStatus('error');
      }
    };

    fetchOnce();
    intervalRef.current = setInterval(fetchOnce, POLL_MS);
    return () => {
      aborted = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token]);

  // Déplacement impératif du marker + recentrage de la carte à chaque
  // nouvelle position GPS (évite les soucis de propagation de prop sur
  // un composant Leaflet chargé via dynamic({ ssr: false })).
  useEffect(() => {
    const loc = data?.lastLocation;
    if (!loc) return;
    const next: [number, number] = [loc.lat, loc.lng];
    if (markerRef.current) {
      markerRef.current.setLatLng(next);
    }
    if (mapRef.current) {
      mapRef.current.setView(next, mapRef.current.getZoom());
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
          <div className="flex items-center justify-center min-h-[60vh] text-[#8A7E75] text-sm px-6 text-center">
            {isFr
              ? 'En attente de la première position GPS du chauffeur…'
              : 'Waiting for the driver\'s first GPS position…'}
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
