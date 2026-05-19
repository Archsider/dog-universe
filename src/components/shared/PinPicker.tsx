'use client';

// PinPicker — small Leaflet map with a draggable marker.  Used after the
// browser geolocation gives us a (lat, lng) on the taxi-pickup form so the
// client can visually confirm the pin and adjust it (GPS in urban Marrakech
// is routinely 50–300 m off — buildings, walls, anciens ruelles).
//
// On drag end, fires `onChange` so the parent can re-do reverse-geocode
// and refresh the address text.  Click on the map drops the pin at the
// click position (useful when geolocation fails altogether).
//
// Designed as a thin wrapper around react-leaflet : the map is lazy-loaded
// SSR-safe (same pattern as /track/[token]/MapView.tsx) so it doesn't ship
// the Leaflet bundle on every booking-form page-load.

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { Loader2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr: false });
const Marker       = dynamic(() => import('react-leaflet').then(m => m.Marker),       { ssr: false });

interface Props {
  lat: number | null;
  lng: number | null;
  /** Fires on every drag-end / map-click — parent should debounce reverse-geocode. */
  onChange: (lat: number, lng: number) => void;
  locale: string;
  /** Pulled through to the accessible label. */
  label?: string;
  /** GPS accuracy in metres returned by the browser ; renders an uncertainty halo. */
  accuracyMeters?: number | null;
}

// Marrakech default centre — used when neither coords nor a previous fix is
// available (so the user can still click-to-place a pin).
const FALLBACK_CENTRE = { lat: 31.6295, lng: -7.9811 };

export default function PinPicker({ lat, lng, onChange, locale, label, accuracyMeters }: Props) {
  const fr = locale === 'fr';
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const [icon, setIcon] = useState<unknown>(null);
  const [mapReady, setMapReady] = useState(false);

  const hasCoords = lat !== null && lng !== null && isFinite(lat) && isFinite(lng);
  const centre = hasCoords ? { lat: lat as number, lng: lng as number } : FALLBACK_CENTRE;

  // Lazy-load the leaflet icon — the default CDN URLs are broken in
  // production bundlers, so we build the icon manually with the public
  // marker assets shipped by `leaflet/dist/images`.
  useEffect(() => {
    void import('leaflet').then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const i = (L as any).icon({
        iconUrl: '/icons/pin-gold.svg',
        iconSize: [36, 48],
        iconAnchor: [18, 46],
        popupAnchor: [0, -40],
      });
      setIcon(i);
    });
  }, []);

  // Pan the map when the parent (re-)sets coords — e.g. user just tapped
  // "Use my position" again after a manual edit.  Without this, the marker
  // moves but the viewport stays on the old location.
  useEffect(() => {
    if (!mapRef.current || !hasCoords) return;
    mapRef.current.setView([lat as number, lng as number], Math.max(mapRef.current.getZoom(), 17), {
      animate: true,
    });
  }, [lat, lng, hasCoords]);

  // Sync the marker draggable position when props change (e.g. user clicked
  // 'Use my position' after manually dragging earlier).
  useEffect(() => {
    if (!markerRef.current || !hasCoords) return;
    markerRef.current.setLatLng([lat as number, lng as number]);
  }, [lat, lng, hasCoords]);

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 relative">
      <div className="relative h-64 w-full">
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-[1]">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}
        <MapContainer
          center={[centre.lat, centre.lng]}
          zoom={hasCoords ? 17 : 13}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          whenReady={((evt: any) => {
            mapRef.current = evt.target ?? null;
            setMapReady(true);
            if (mapRef.current) {
              mapRef.current.on('click', (e) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { lat: clat, lng: clng } = (e as any).latlng;
                onChange(clat, clng);
              });
            }
          }) as unknown as () => void}
          aria-label={label ?? (fr ? 'Carte d\'adresse — pin déplaçable' : 'Address map — draggable pin')}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          {hasCoords && icon !== null && (
            <Marker
              position={[lat as number, lng as number]}
              draggable
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              icon={icon as any}
              eventHandlers={{
                add: (e) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  markerRef.current = (e as any).target ?? null;
                },
                dragend: (e) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const m = (e as any).target;
                  const pos = m.getLatLng();
                  onChange(pos.lat, pos.lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="px-3 py-2 text-[11px] text-charcoal/60 bg-white border-t border-gray-200">
        {hasCoords ? (
          <>
            {fr
              ? '📍 Glissez l\'épingle ou touchez la carte pour ajuster.'
              : '📍 Drag the pin or tap the map to adjust.'}
            {typeof accuracyMeters === 'number' && accuracyMeters > 0 && (
              <span className="ml-2 text-charcoal/40">
                {fr ? `précision ±${Math.round(accuracyMeters)} m` : `accuracy ±${Math.round(accuracyMeters)} m`}
              </span>
            )}
          </>
        ) : (
          <>{fr
            ? 'Touchez la carte pour placer l\'épingle, ou utilisez "Ma position".'
            : 'Tap the map to drop the pin, or use "My location".'}
          </>
        )}
      </div>
    </div>
  );
}
