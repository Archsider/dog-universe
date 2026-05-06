'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Play, Pause } from 'lucide-react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';

// Reuses the public MapView wrapper — keeps Leaflet out of the initial bundle
// until an admin actually opens a completed taxi trip's replay panel.
const MapView = dynamic(() => import('../../../track/[token]/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[280px] bg-ivory-50 rounded-lg">
      <div className="inline-block w-8 h-8 border-2 border-[#C4974A] border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

interface Props {
  taxiTripId: string;
  locale: string;
}

interface Position {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

const TICK_MS = 100; // 10x speed: 100ms between scrubber ticks during autoplay.

// Haversine — local copy to avoid pulling in /lib/geo.ts (works in any unit
// system; we want km here for the trip total readout).
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export default function AdminTaxiReplay({ taxiTripId, locale }: Props) {
  const isFr = locale !== 'en';
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [carIcon, setCarIcon] = useState<unknown>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/taxi-trips/${taxiTripId}/locations`, { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) {
          setError(isFr ? 'Impossible de charger l’historique GPS.' : 'Failed to load GPS history.');
          return;
        }
        const json = (await res.json()) as { positions?: Position[] };
        if (cancelled) return;
        setPositions(json.positions ?? []);
      } catch {
        if (!cancelled) setError(isFr ? 'Erreur réseau.' : 'Network error.');
      }
    })();
    return () => { cancelled = true; };
  }, [taxiTripId, isFr]);

  // Load the same heading-aware divIcon used by the live map.
  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled) return;
      setCarIcon(L.divIcon({
        html: `<div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
  <div data-rotor style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;transition:transform 0.3s ease-out;">
    <svg width="26" height="26" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="11" fill="#C4974A" stroke="white" stroke-width="3" />
      <path d="M14 6 L18 14 L14 12 L10 14 Z" fill="white" />
    </svg>
  </div>
</div>`,
        className: '',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }));
    });
    return () => { cancelled = true; };
  }, []);

  // Autoplay tick — advances the cursor every TICK_MS, pauses at end.
  useEffect(() => {
    if (!playing || !positions || positions.length === 0) return;
    playTimerRef.current = setInterval(() => {
      setIdx((cur) => {
        if (cur >= positions.length - 1) {
          setPlaying(false);
          return cur;
        }
        return cur + 1;
      });
    }, TICK_MS);
    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [playing, positions]);

  const total = useMemo(() => {
    if (!positions || positions.length < 2) {
      return { km: 0, durationMs: 0 };
    }
    let km = 0;
    for (let i = 1; i < positions.length; i++) {
      km += haversineKm(positions[i - 1].lat, positions[i - 1].lng, positions[i].lat, positions[i].lng);
    }
    const durationMs = positions[positions.length - 1].timestamp - positions[0].timestamp;
    return { km, durationMs };
  }, [positions]);

  const trail = useMemo<[number, number][]>(() => {
    if (!positions) return [];
    return positions.map(p => [p.lat, p.lng] as [number, number]);
  }, [positions]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
    );
  }

  if (!positions) {
    return (
      <div className="rounded-lg border border-[rgba(196,151,74,0.2)] bg-ivory-50 p-4 text-center">
        <div className="inline-block w-6 h-6 border-2 border-[#C4974A] border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-xs text-charcoal/60">{isFr ? 'Chargement du replay…' : 'Loading replay…'}</p>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="rounded-lg border border-[rgba(196,151,74,0.2)] bg-ivory-50 p-4 text-center text-xs text-charcoal/60">
        {isFr ? 'Aucune donnée GPS enregistrée pour cette course.' : 'No GPS data recorded for this trip.'}
      </div>
    );
  }

  const safeIdx = Math.min(idx, positions.length - 1);
  const cur = positions[safeIdx];
  const center: [number, number] = [cur.lat, cur.lng];
  const ts = new Date(cur.timestamp).toLocaleTimeString(isFr ? 'fr-FR' : 'en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const speedKmh = typeof cur.speed === 'number' && cur.speed >= 0 ? Math.round(cur.speed * 3.6) : null;
  const durationMin = Math.round(total.durationMs / 60000);

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden border border-[rgba(196,151,74,0.3)] h-[280px]">
        <MapView
          center={center}
          mapRef={mapRef}
          markerRef={markerRef}
          carIcon={carIcon}
          heading={cur.heading ?? null}
          trailPositions={trail}
          recenterLabel={isFr ? 'Recentrer' : 'Recenter'}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 px-1">
        <button
          type="button"
          onClick={() => {
            if (safeIdx >= positions.length - 1) {
              setIdx(0);
              setPlaying(true);
            } else {
              setPlaying((p) => !p);
            }
          }}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#C4974A] text-white hover:bg-[#B0853E] transition-colors"
          aria-label={playing ? (isFr ? 'Pause' : 'Pause') : (isFr ? 'Lecture' : 'Play')}
          title={playing ? (isFr ? 'Pause' : 'Pause') : (isFr ? 'Lecture' : 'Play')}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <input
          type="range"
          min={0}
          max={positions.length - 1}
          value={safeIdx}
          onChange={(e) => {
            setIdx(Number(e.target.value));
            setPlaying(false);
          }}
          className="flex-1 accent-[#C4974A]"
          aria-label={isFr ? 'Position dans le temps' : 'Time scrubber'}
        />
        <span className="text-xs text-charcoal/60 tabular-nums w-16 text-right">
          {safeIdx + 1}/{positions.length}
        </span>
      </div>

      {/* Readout */}
      <div className="flex items-center justify-between text-xs text-charcoal/60 px-1">
        <span className="flex items-center gap-2">
          <span>{ts}</span>
          {speedKmh !== null && <span>{speedKmh} km/h</span>}
        </span>
        <span className="flex items-center gap-3">
          <span className="font-medium text-[#C4974A]">
            {total.km >= 10 ? `${total.km.toFixed(1)} km` : `${total.km.toFixed(2)} km`}
          </span>
          <span>{durationMin} min</span>
        </span>
      </div>
    </div>
  );
}
