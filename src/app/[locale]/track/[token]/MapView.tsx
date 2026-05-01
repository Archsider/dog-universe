'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import dynamic from 'next/dynamic';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import('react-leaflet').then(m => m.TileLayer),    { ssr: false });
const Marker       = dynamic(() => import('react-leaflet').then(m => m.Marker),       { ssr: false });

interface Props {
  center: [number, number];
  mapRef: React.MutableRefObject<LeafletMap | null>;
  markerRef: React.MutableRefObject<LeafletMarker | null>;
  carIcon: unknown;
}

export default function MapView({ center, mapRef, markerRef, carIcon }: Props) {
  // Imperative position update: move marker + fly camera on coord change.
  const prevCenter = useRef(center);
  useEffect(() => {
    const [lat, lng] = center;
    const [prevLat, prevLng] = prevCenter.current;
    if (lat === prevLat && lng === prevLng) return;
    prevCenter.current = center;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    }
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], 16, { duration: 1 });
    }
  }, [center, mapRef, markerRef]);

  return (
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
  );
}
