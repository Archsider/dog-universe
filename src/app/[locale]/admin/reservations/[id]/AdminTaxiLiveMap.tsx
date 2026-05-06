'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw } from 'lucide-react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';

// Reuses the same MapView wrapper as the public tracking page — Leaflet stays
// out of the initial bundle until the admin opens an in-progress taxi trip.
const MapView = dynamic(() => import('../../../track/[token]/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[280px] bg-ivory-50 rounded-lg">
      <div className="inline-block w-8 h-8 border-2 border-[#C4974A] border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

const FALLBACK_POLL_MS = 10_000;
const SSE_MAX_RECONNECT_ATTEMPTS = 3;

interface Props {
  trackingToken: string;
  locale: string;
}

interface Snapshot {
  lat: number;
  lng: number;
  timestamp: number;
  heading?: number | null;
  speed?: number | null;
  distanceKm?: number;
}

// Merge an incoming partial snapshot into the current state, preserving
// fields (like distanceKm) that the new event may not include.
function mergeSnapshot(prev: Snapshot | null, next: Snapshot): Snapshot {
  return {
    ...next,
    distanceKm: typeof next.distanceKm === 'number' ? next.distanceKm : prev?.distanceKm,
    heading: next.heading ?? prev?.heading ?? null,
    speed: next.speed ?? prev?.speed ?? null,
  };
}

export default function AdminTaxiLiveMap({ trackingToken, locale }: Props) {
  const isFr = locale !== 'en';
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [carIcon, setCarIcon] = useState<unknown>(null);
  const [streamLive, setStreamLive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch(`/api/taxi-tracking/${trackingToken}`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json() as { distanceKm?: number; lastLocation?: { lat: number; lng: number; heading: number | null; speed: number | null; createdAt: string } | null };
      if (json.lastLocation) {
        setSnap(prev => mergeSnapshot(prev, {
          lat: json.lastLocation!.lat,
          lng: json.lastLocation!.lng,
          timestamp: new Date(json.lastLocation!.createdAt).getTime(),
          heading: json.lastLocation!.heading,
          speed: json.lastLocation!.speed,
          distanceKm: json.distanceKm,
        }));
      } else if (typeof json.distanceKm === 'number') {
        // No new position but distance available — preserve the prior snap and
        // just update the cumulative distance counter.
        setSnap(prev => prev ? { ...prev, distanceKm: json.distanceKm } : prev);
      }
    } catch { /* swallow */ }
  }, [trackingToken]);

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchOnce(); } finally { setRefreshing(false); }
  }, [fetchOnce]);

  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((L) => {
      if (cancelled) return;
      setCarIcon(L.divIcon({
        html: '<div style="width:22px;height:22px;border-radius:50%;border:3px solid white;background:#C4974A;box-shadow:0 2px 10px rgba(196,151,74,0.6);"></div>',
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!trackingToken) return;
    let aborted = false;

    // Initial REST fetch — guarantees the map shows the last-known position
    // even before SSE warms up (or if Redis is empty / unconfigured).
    void fetchOnce();

    const startFallback = () => {
      const tick = async () => {
        if (aborted) return;
        await fetchOnce();
        if (!aborted) fallbackTimerRef.current = setTimeout(tick, FALLBACK_POLL_MS);
      };
      void tick();
    };

    if (typeof EventSource === 'undefined') { startFallback(); return; }

    let consecutiveErrors = 0;
    const es = new EventSource(`/api/taxi/${trackingToken}/stream`);
    eventSourceRef.current = es;

    es.addEventListener('connected', () => { consecutiveErrors = 0; setStreamLive(true); });
    es.addEventListener('location', (ev) => {
      if (aborted) return;
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as Snapshot;
        // Merge so a position event without distanceKm doesn't blank the counter.
        setSnap(prev => mergeSnapshot(prev, payload));
      } catch { /* ignore */ }
    });
    // Server-side soft-timeout (~54s) sends 'reconnect' before closing the
    // stream. EventSource auto-reconnects transparently — make sure the error
    // counter is reset so we don't escalate to polling on every cycle.
    es.addEventListener('reconnect', () => { consecutiveErrors = 0; });
    es.addEventListener('completed', () => { setStreamLive(false); es.close(); });
    es.onerror = () => {
      consecutiveErrors += 1;
      if (consecutiveErrors >= SSE_MAX_RECONNECT_ATTEMPTS) {
        es.close();
        eventSourceRef.current = null;
        setStreamLive(false);
        if (!aborted) startFallback();
      }
    };

    return () => {
      aborted = true;
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    };
  }, [trackingToken, fetchOnce]);

  if (!snap) {
    return (
      <div className="rounded-lg border border-[rgba(196,151,74,0.2)] bg-ivory-50 p-4 text-center">
        <div className="inline-block w-6 h-6 border-2 border-[#C4974A] border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-xs text-charcoal/60">
          {isFr ? 'En attente de la position GPS du chauffeur…' : 'Waiting for driver GPS…'}
        </p>
      </div>
    );
  }

  const updatedAt = new Date(snap.timestamp).toLocaleTimeString(isFr ? 'fr-FR' : 'en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div className="space-y-2">
      <div className="rounded-lg overflow-hidden border border-[rgba(196,151,74,0.3)] h-[280px]">
        <MapView
          center={[snap.lat, snap.lng]}
          mapRef={mapRef}
          markerRef={markerRef}
          carIcon={carIcon}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-charcoal/60 px-1">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${streamLive ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
          {streamLive
            ? (isFr ? 'Direct' : 'Live')
            : (isFr ? 'Polling 10s' : 'Polling 10s')}
          <span className="ml-2">{isFr ? 'Mis à jour' : 'Updated'} {updatedAt}</span>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="ml-1 p-1 rounded hover:bg-charcoal/5 disabled:opacity-50 transition-colors"
            aria-label={isFr ? 'Rafraîchir' : 'Refresh'}
            title={isFr ? 'Rafraîchir' : 'Refresh'}
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </span>
        <span className="flex items-center gap-3">
          {typeof snap.distanceKm === 'number' && (
            <span className="font-medium text-[#C4974A]">
              {snap.distanceKm >= 10
                ? `${snap.distanceKm.toFixed(1)} km`
                : `${snap.distanceKm.toFixed(2)} km`}
            </span>
          )}
          {typeof snap.speed === 'number' && snap.speed >= 0 && (
            <span>{Math.round(snap.speed * 3.6)} km/h</span>
          )}
        </span>
      </div>
    </div>
  );
}
