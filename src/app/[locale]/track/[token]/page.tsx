'use client';

// Slim orchestrator — see _lib/ and _components/ for the extracted hooks
// and section components.
//
// File went from 521 LOC to ~80 by extracting:
//   - _lib/use-car-icon.ts         (50L)  Leaflet divIcon (dynamic import)
//   - _lib/use-tracking-stream.ts  (320L) the giant SSE+polling+watchdog effect
//   - _components/StatusViews.tsx  (90L)  loading / not-found / inactive / error
//   - _components/HeaderFooter.tsx (150L) header + footer + connection badge
//
// What stays here: param resolution, two refs for Leaflet (mapRef +
// markerRef), and the JSX shell that picks between status views.

import { useRef } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { useCarIcon } from './_lib/use-car-icon';
import { useTrackingStream } from './_lib/use-tracking-stream';
import {
  ErrorView,
  InactiveView,
  LoadingView,
  NotFoundView,
  WaitingForFix,
} from './_components/StatusViews';
import {
  TrackFooter,
  TrackHeader,
  getConnectionBadge,
} from './_components/HeaderFooter';

// MapView encapsulates all Leaflet imports (CSS + JS) — lazy loaded only
// when a GPS position is available, keeping Leaflet out of the initial
// page bundle.
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 gap-4">
      <div className="inline-block w-10 h-10 border-[3px] border-[#C4974A] border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

export default function TrackPage() {
  const params = useParams<{ locale: string; token: string }>();
  const locale = params?.locale === 'en' ? 'en' : 'fr';
  const isFr = locale === 'fr';
  const token = params?.token ?? '';

  const carIcon = useCarIcon();
  const { data, status, trail, connectionStatus } = useTrackingStream(token);

  // Imperative Leaflet refs — handed to MapView for in-place updates
  // (setLatLng / flyTo) without re-rendering the parent.
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);

  // ── Pre-OK status views ─────────────────────────────────────────────────
  if (status === 'loading') return <LoadingView isFr={isFr} />;
  if (status === 'notfound') return <NotFoundView isFr={isFr} />;
  if (status === 'inactive') return <InactiveView isFr={isFr} />;
  if (status === 'error') return <ErrorView isFr={isFr} />;

  const last = data?.lastLocation;
  const center: [number, number] = last
    ? [last.lat, last.lng]
    : [31.6295, -7.9811]; // Marrakech fallback
  const updatedAt = last
    ? new Date(last.createdAt).toLocaleTimeString(isFr ? 'fr-FR' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '';

  const badge = getConnectionBadge(connectionStatus, isFr);

  return (
    <div className="min-h-screen flex flex-col bg-[#FEFCF9]">
      <TrackHeader isFr={isFr} data={data} badge={badge} />

      <div className="flex-1 relative">
        {last ? (
          <MapView
            center={center}
            mapRef={mapRef}
            markerRef={markerRef}
            carIcon={carIcon}
            heading={last?.heading ?? null}
            trailPositions={trail}
            recenterLabel={isFr ? 'Recentrer' : 'Recenter'}
          />
        ) : (
          <WaitingForFix isFr={isFr} />
        )}
      </div>

      {last && (
        <TrackFooter
          isFr={isFr}
          badge={badge}
          updatedAt={updatedAt}
          distanceKm={data?.distanceKm}
          speedMs={last.speed}
        />
      )}
    </div>
  );
}
