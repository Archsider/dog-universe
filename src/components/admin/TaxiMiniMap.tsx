'use client';

// Read-only mini-map for the taxi pickup/dropoff location on the admin
// booking detail. Replaces the old <iframe src="openstreetmap.org/export/embed">
// which OpenStreetMap's main domain now refuses to frame (X-Frame-Options →
// "www.openstreetmap.org n'autorise pas la connexion"). We render OSM tiles
// ourselves via Leaflet — plain image tiles are never refused, no API key.

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import dynamic from 'next/dynamic';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// react-leaflet is NOT SSR-safe — load client-only, same pattern as MapView.
const MapContainer = dynamic(() => import('react-leaflet').then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), { ssr: false });

interface Props {
  lat: number;
  lng: number;
  label?: string;
}

export default function TaxiMiniMap({ lat, lng, label }: Props) {
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);

  // Place a gold pin imperatively (avoids react-leaflet's default icon asset
  // 404) + keep the view centered when coordinates change.
  useEffect(() => {
    let cancelled = false;
    let raf: number | null = null;
    const attach = async () => {
      if (cancelled) return;
      const map = mapRef.current;
      if (!map) {
        raf = requestAnimationFrame(attach);
        return;
      }
      const L = await import('leaflet');
      if (cancelled) return;
      map.setView([lat, lng], 15);
      const icon = L.divIcon({
        className: 'dog-universe-pickup-pin',
        html: `<div style="width:28px;height:28px;border-radius:50%;background:#C4974A;border:3px solid #fff;box-shadow:0 4px 12px rgba(196,151,74,.5);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;">📍</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      if (!markerRef.current) {
        markerRef.current = L.marker([lat, lng], { icon, title: label, alt: label }).addTo(map);
      } else {
        markerRef.current.setLatLng([lat, lng]);
        markerRef.current.setIcon(icon);
      }
    };
    void attach();
    return () => {
      cancelled = true;
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [lat, lng, label]);

  useEffect(() => {
    return () => {
      if (markerRef.current) {
        try { markerRef.current.remove(); } catch { /* noop */ }
        markerRef.current = null;
      }
    };
  }, []);

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
      ref={mapRef as never}
    >
      <TileLayer attribution={TILE_ATTRIB} url={TILE_URL} />
    </MapContainer>
  );
}
