'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker, Polyline as LeafletPolyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import dynamic from 'next/dynamic';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr: false });
const Marker       = dynamic(() => import('react-leaflet').then(m => m.Marker),       { ssr: false });

const TRAIL_COLOR = '#C4974A';
const TRAIL_WEIGHT = 3;
const TRAIL_OPACITY = 0.6;
const MAX_TRAIL_POINTS = 200;
const INTERP_MAX_MS = 2000;

interface Props {
  center: [number, number];
  mapRef: React.MutableRefObject<LeafletMap | null>;
  markerRef: React.MutableRefObject<LeafletMarker | null>;
  carIcon: unknown;
  /** Heading in degrees (0=North), used to rotate the marker icon. */
  heading?: number | null;
  /** Sequence of [lat, lng] points to render as a gold polyline trail. */
  trailPositions?: [number, number][];
  /** Localized label for the recenter button (defaults to FR). */
  recenterLabel?: string;
}

export default function MapView({
  center,
  mapRef,
  markerRef,
  carIcon,
  heading,
  trailPositions,
  recenterLabel,
}: Props) {
  // Smooth interpolation: animate marker between successive positions via
  // requestAnimationFrame instead of jumping. Each new `center` cancels the
  // previous animation and starts a new linear interpolation, capped at 2s.
  const prevCenter = useRef(center);
  const lastUpdateAt = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  // Auto-follow toggle: panTo on every center change unless the user manually
  // panned/zoomed the map. Stored as a ref to avoid re-renders inside the
  // animation loop and to be readable from event handlers.
  const followRef = useRef(true);
  const programmaticPanRef = useRef(false);
  const polylineRef = useRef<LeafletPolyline | null>(null);
  const recenterBtnRef = useRef<HTMLButtonElement | null>(null);

  // Update marker rotation when heading changes (independent from position).
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const el = marker.getElement() as HTMLElement | null;
    if (!el) return;
    const inner = el.querySelector('[data-rotor]') as HTMLElement | null;
    if (!inner) return;
    if (typeof heading === 'number' && Number.isFinite(heading)) {
      inner.style.transform = `rotate(${heading}deg)`;
    } else {
      inner.style.transform = '';
    }
  }, [heading, markerRef, center]);

  // Imperative position update with RAF interpolation + auto-follow.
  useEffect(() => {
    const [lat, lng] = center;
    const [prevLat, prevLng] = prevCenter.current;
    if (lat === prevLat && lng === prevLng) return;

    const now = performance.now();
    const elapsedSinceLast = lastUpdateAt.current ? now - lastUpdateAt.current : INTERP_MAX_MS;
    lastUpdateAt.current = now;
    const duration = Math.max(200, Math.min(elapsedSinceLast, INTERP_MAX_MS));
    const startLat = prevLat;
    const startLng = prevLng;
    prevCenter.current = center;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const startedAt = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const curLat = startLat + (lat - startLat) * t;
      const curLng = startLng + (lng - startLng) * t;
      if (markerRef.current) {
        markerRef.current.setLatLng([curLat, curLng]);
      }
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    if (mapRef.current && followRef.current) {
      programmaticPanRef.current = true;
      mapRef.current.panTo([lat, lng], { animate: true, duration: 0.8 });
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [center, mapRef, markerRef]);

  // Wire up dragstart / zoomstart to disable auto-follow when the user
  // interacts with the map. Show recenter button when follow is off.
  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    const tryAttach = () => {
      if (cancelled) return;
      map = mapRef.current;
      if (!map) {
        // MapContainer may not have set the ref yet — retry on next frame.
        rafAttach = requestAnimationFrame(tryAttach);
        return;
      }
      const onUserInteract = () => {
        // Ignore programmatic pans (auto-follow). User-driven pans set the
        // followRef to false and reveal the recenter button.
        if (programmaticPanRef.current) {
          programmaticPanRef.current = false;
          return;
        }
        if (followRef.current) {
          followRef.current = false;
          if (recenterBtnRef.current) recenterBtnRef.current.style.display = 'flex';
        }
      };
      map.on('dragstart', onUserInteract);
      map.on('zoomstart', onUserInteract);
    };

    let rafAttach: number = requestAnimationFrame(tryAttach);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafAttach);
      if (map) {
        map.off('dragstart');
        map.off('zoomstart');
      }
    };
  }, [mapRef]);

  // Maintain a Leaflet polyline that mirrors `trailPositions`. Capped at
  // MAX_TRAIL_POINTS by the parent (we just render whatever we receive).
  useEffect(() => {
    let cancelled = false;
    let attachRaf: number | null = null;
    const attach = async () => {
      if (cancelled) return;
      const map = mapRef.current;
      if (!map) {
        attachRaf = requestAnimationFrame(attach);
        return;
      }
      const L = await import('leaflet');
      if (cancelled) return;
      const points: [number, number][] = (trailPositions ?? []).slice(-MAX_TRAIL_POINTS);
      if (!polylineRef.current) {
        polylineRef.current = L.polyline(points, {
          color: TRAIL_COLOR,
          weight: TRAIL_WEIGHT,
          opacity: TRAIL_OPACITY,
        }).addTo(map);
      } else {
        polylineRef.current.setLatLngs(points);
      }
    };
    void attach();
    return () => {
      cancelled = true;
      if (attachRaf !== null) cancelAnimationFrame(attachRaf);
    };
  }, [trailPositions, mapRef]);

  // Cleanup polyline on unmount.
  useEffect(() => {
    return () => {
      if (polylineRef.current) {
        try { polylineRef.current.remove(); } catch { /* noop */ }
        polylineRef.current = null;
      }
    };
  }, []);

  const handleRecenter = () => {
    followRef.current = true;
    if (recenterBtnRef.current) recenterBtnRef.current.style.display = 'none';
    if (mapRef.current) {
      programmaticPanRef.current = true;
      mapRef.current.panTo(center, { animate: true, duration: 0.6 });
    }
  };

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
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
      <button
        ref={recenterBtnRef}
        type="button"
        onClick={handleRecenter}
        aria-label={recenterLabel ?? 'Recentrer'}
        title={recenterLabel ?? 'Recentrer'}
        style={{
          display: 'none',
          position: 'absolute',
          right: 12,
          bottom: 12,
          zIndex: 500,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: '#FFFFFF',
          border: '2px solid #C4974A',
          boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 20,
          color: '#C4974A',
          padding: 0,
        }}
      >
        {/* Pin emoji: works without extra deps, matches "recenter" affordance */}
        <span aria-hidden>📍</span>
      </button>
    </div>
  );
}
