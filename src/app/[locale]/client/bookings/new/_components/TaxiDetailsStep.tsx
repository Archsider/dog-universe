'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { formatMAD } from '@/lib/utils';
import { TAXI_PRICES, type TaxiType } from '../_lib/types';
import type { WizardLabels } from '../_lib/i18n';
import type { TaxiState } from '../_lib/use-form-state';
import { isValidTaxiDate } from '../_lib/validation';
import { requestGeo } from '../_lib/geo';

export interface TaxiDetailsStepProps {
  locale: string;
  l: WizardLabels;
  today: string;
  taxi: TaxiState;
}

export function TaxiDetailsStep({ locale, l, today, taxi }: TaxiDetailsStepProps) {
  return (
    <div className="space-y-5">
      <div>
        <Label>{l.taxiTypeLabel}</Label>
        <div className="grid grid-cols-3 gap-2 mt-2">
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
        <Input id="pickup" value={taxi.pickupAddress} onChange={e => taxi.setPickupAddress(e.target.value)} placeholder="Gueliz, Marrakech" className="mt-1" />
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
