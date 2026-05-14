'use client';

// Custom Leaflet `divIcon` for the moving taxi marker. We use a divIcon
// (inline SVG, no external image) so the icon is CSP-safe and works
// without a separate HTTP request. The `data-rotor` div is targeted
// later by the heading-rotation logic in MapView.
//
// Returned as `unknown` because we don't want to import the Leaflet
// types statically — the whole file is dynamically imported only when
// a position is available, keeping Leaflet out of the initial bundle.

import { useEffect, useState } from 'react';

type LeafletDivIcon = unknown;

const CAR_ICON_HTML = `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
  <div data-rotor style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;transition:transform 0.3s ease-out;">
    <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="11" fill="#C4974A" stroke="white" stroke-width="3" />
      <path d="M14 6 L18 14 L14 12 L10 14 Z" fill="white" />
    </svg>
  </div>
</div>`;

export function useCarIcon(): LeafletDivIcon | null {
  const [carIcon, setCarIcon] = useState<LeafletDivIcon | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled) return;
      const icon = L.divIcon({
        html: CAR_ICON_HTML,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      setCarIcon(icon);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return carIcon;
}
