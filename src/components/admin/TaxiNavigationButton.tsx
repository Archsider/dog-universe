'use client';

import { MapPin, Navigation, Search } from 'lucide-react';

interface Props {
  pickupLat: number | null;
  pickupLng: number | null;
  pickupAddress: string | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  dropoffAddress?: string | null;
  locale: 'fr' | 'en';
}

const labels = {
  fr: {
    coords: 'Coordonnées',
    address: 'Adresse',
    googleMaps: 'Naviguer (Google Maps)',
    waze: 'Naviguer (Waze)',
    search: 'Chercher dans Google Maps',
    none: 'Aucune localisation enregistrée',
  },
  en: {
    coords: 'Coordinates',
    address: 'Address',
    googleMaps: 'Navigate (Google Maps)',
    waze: 'Navigate (Waze)',
    search: 'Search in Google Maps',
    none: 'No location recorded',
  },
};

function NavBlock({
  lat,
  lng,
  address,
  locale,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  address: string | null | undefined;
  locale: 'fr' | 'en';
}) {
  const l = labels[locale] || labels.fr;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';
  const hasAddress = typeof address === 'string' && address.trim().length > 0;

  if (hasCoords) {
    const gmaps = `https://maps.google.com/?q=${lat},${lng}`;
    const waze = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    const staticMap = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=400x200&markers=${lat},${lng},red-pushpin`;
    return (
      <div className="space-y-3">
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">{l.coords}</span>
            <span className="font-mono text-charcoal text-xs">
              {lat!.toFixed(4)}, {lng!.toFixed(4)}
            </span>
          </div>
          {hasAddress && (
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">{l.address}</span>
              <span className="text-charcoal text-right">{address}</span>
            </div>
          )}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={staticMap}
          alt="Position sur la carte"
          width={400}
          height={200}
          className="w-full rounded-lg border border-gray-200 object-cover"
          loading="lazy"
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href={gmaps}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <Navigation className="h-4 w-4" />
            <span>🗺️ {l.googleMaps}</span>
          </a>
          <a
            href={waze}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors"
          >
            <Navigation className="h-4 w-4" />
            <span>🚗 {l.waze}</span>
          </a>
        </div>
      </div>
    );
  }

  if (hasAddress) {
    const search = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address!)}`;
    return (
      <div className="space-y-3">
        <div className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">{l.address}</span>
            <span className="text-charcoal text-right">{address}</span>
          </div>
        </div>
        <a
          href={search}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <Search className="h-4 w-4" />
          <span>🔍 {l.search}</span>
        </a>
      </div>
    );
  }

  return (
    <p className="text-sm text-gray-400 italic flex items-center gap-2">
      <MapPin className="h-4 w-4" />
      {l.none}
    </p>
  );
}

export default function TaxiNavigationButton({
  pickupLat,
  pickupLng,
  pickupAddress,
  dropoffLat,
  dropoffLng,
  dropoffAddress,
  locale,
}: Props) {
  return (
    <NavBlock
      lat={pickupLat}
      lng={pickupLng}
      address={pickupAddress}
      locale={locale}
    />
  );
}

export { NavBlock as TaxiNavBlock };
