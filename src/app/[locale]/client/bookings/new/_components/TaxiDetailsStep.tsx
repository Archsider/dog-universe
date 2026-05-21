'use client';

import dynamic from 'next/dynamic';
import { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AddressAutocomplete } from '@/components/shared/AddressAutocomplete';
import { toast } from '@/hooks/use-toast';
import { formatMAD } from '@/lib/utils';
import { TAXI_PRICES, type TaxiType } from '../_lib/types';
import type { WizardLabels } from '../_lib/i18n';
import type { TaxiState } from '../_lib/use-form-state';
import { isValidTaxiDate } from '../_lib/validation';
import { requestGeo } from '../_lib/geo';

// PinPicker is Leaflet-heavy — lazy load so the wizard's other steps
// don't ship the map bundle.
const PinPicker = dynamic(() => import('@/components/shared/PinPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />
  ),
});

export interface TaxiDetailsStepProps {
  locale: string;
  l: WizardLabels;
  today: string;
  taxi: TaxiState;
}

export function TaxiDetailsStep({ locale, l, today, taxi }: TaxiDetailsStepProps) {
  // Debounce reverse-geocode after pin drag so we don't hammer the
  // Nominatim cache key with every pixel-shift during a continuous drag.
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onPinChange(lat: number, lng: number) {
    taxi.setPickupLat(lat);
    taxi.setPickupLng(lng);
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}&lang=${locale}`);
        if (!r.ok) return;
        const j = await r.json();
        if (typeof j?.address === 'string' && j.address.length > 0) {
          taxi.setPickupAddress(j.address);
        }
      } catch { /* keep coords, address stays editable manually */ }
    }, 600);
  }

  return (
    <div className="space-y-5">
      <div>
        <Label>{l.taxiTypeLabel}</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
          {([['STANDARD', l.standard, TAXI_PRICES.STANDARD], ['VET', l.vet, TAXI_PRICES.VET], ['AIRPORT', l.airport, TAXI_PRICES.AIRPORT]] as const).map(([type, label, price]) => (
            <button
              key={type}
              onClick={() => taxi.setType(type as TaxiType)}
              className={`p-3 rounded-lg border-2 text-center text-sm transition-all ${
                taxi.type === type ? 'border-gold-400 bg-gold-50' : 'border-ivory-200 hover:border-gold-200'
              }`}
            >
              <div className="font-medium text-charcoal">{label}</div>
              <div className="text-gold-600 font-semibold">{formatMAD(price)}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="tdate">{l.taxiDateLabel} *</Label>
          <Input
            id="tdate"
            type="date"
            value={taxi.date}
            onChange={e => {
              const val = e.target.value;
              taxi.setDate(val);
              if (val && !isValidTaxiDate(val)) toast({ title: l.sundayNotAllowed, variant: 'destructive' });
            }}
            min={today}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="ttime">{l.taxiTimeLabel} * (10h-17h)</Label>
          <Input
            id="ttime"
            type="time"
            value={taxi.time}
            onChange={e => taxi.setTime(e.target.value)}
            min="10:00"
            max="17:00"
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label htmlFor="pickup">{l.pickup} *</Label>
          <button
            type="button"
            disabled={taxi.geolocating}
            onClick={() => requestGeo(
              locale,
              (lat, lng) => { taxi.setPickupLat(lat); taxi.setPickupLng(lng); },
              taxi.setPickupAddress,
              taxi.setGeolocating,
              l,
            )}
            className="text-xs text-gold-600 hover:text-gold-700 disabled:opacity-50"
          >
            {taxi.geolocating ? l.locating : l.useMyLocation}
          </button>
        </div>
        <AddressAutocomplete
          id="pickup"
          value={taxi.pickupAddress}
          onChange={taxi.setPickupAddress}
          onSelect={(label, lat, lng) => {
            taxi.setPickupAddress(label);
            taxi.setPickupLat(lat);
            taxi.setPickupLng(lng);
          }}
          locale={locale}
          placeholder="Gueliz, Marrakech"
          className="mt-1"
        />
        <div className="mt-2">
          <PinPicker
            lat={taxi.pickupLat}
            lng={taxi.pickupLng}
            onChange={onPinChange}
            locale={locale}
            label={l.pickup}
          />
        </div>
      </div>
      {/* Champ OBLIGATOIRE — nom résidence/villa que la sécurité demande au
          chauffeur. Le GPS Nominatim n'est pas assez précis. */}
      <div className="rounded-lg border-2 border-gold-300 bg-gold-50/60 p-3">
        <Label htmlFor="pickup-place" className="text-charcoal font-medium">
          🏡 {l.placeName} *
        </Label>
        <Input
          id="pickup-place"
          value={taxi.pickupPlaceName}
          onChange={e => taxi.setPickupPlaceName(e.target.value)}
          placeholder={l.placeNamePlaceholder}
          className="mt-1 bg-white"
          maxLength={160}
          required
        />
        <p className="text-xs text-charcoal/60 mt-1.5">{l.placeNameHint}</p>
      </div>
      <div>
        <Label htmlFor="dropoff">{l.dropoff} *</Label>
        <Input id="dropoff" value={taxi.dropoffAddress} onChange={e => taxi.setDropoffAddress(e.target.value)} placeholder="Aéroport Menara" className="mt-1" />
      </div>
      <div>
        <Label htmlFor="tnotes">{l.notes}</Label>
        <Textarea id="tnotes" value={taxi.notes} onChange={e => taxi.setNotes(e.target.value)} placeholder={l.notesPlaceholder} rows={3} className="mt-1" />
      </div>
    </div>
  );
}
