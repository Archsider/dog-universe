'use client';

import { AlertCircle, Car } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { AvailabilityCalendar } from '@/components/shared/AvailabilityCalendar';
import { GROOMING_PRICES, TAXI_ADDON_PRICE, type Pet, type PetSize } from '../_lib/types';
import type { WizardLabels } from '../_lib/i18n';
import type { BoardingState, TaxiAddonState } from '../_lib/use-form-state';
import { isValidTaxiDate } from '../_lib/validation';
import { requestGeo } from '../_lib/geo';

interface AddonProps {
  locale: string;
  l: WizardLabels;
  today: string;
  state: TaxiAddonState;
  idPrefix: 'taxi-go' | 'taxi-return';
  title: string;
  dateLabel: string;
}

function TaxiAddon({ locale, l, today, state, idPrefix, title, dateLabel }: AddonProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={idPrefix}
          checked={state.enabled}
          onChange={e => state.setEnabled(e.target.checked)}
          className="w-4 h-4 accent-gold-500"
        />
        <label htmlFor={idPrefix} className="text-sm font-medium text-charcoal cursor-pointer">
          {title} <span className="text-gold-600">+{TAXI_ADDON_PRICE} MAD</span>
        </label>
      </div>
      {state.enabled && (
        <div className="grid grid-cols-2 gap-3 pl-6">
          <div>
            <Label className="text-xs">{dateLabel} *</Label>
            <Input
              type="date"
              value={state.date}
              onChange={e => {
                const val = e.target.value;
                state.setDate(val);
                if (val && !isValidTaxiDate(val)) toast({ title: l.sundayNotAllowed, variant: 'destructive' });
              }}
              min={today}
              className="mt-1 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">{l.taxiTime} * (10h-17h)</Label>
            <Input
              type="time"
              value={state.time}
              onChange={e => state.setTime(e.target.value)}
              min="10:00"
              max="17:00"
              className="mt-1 text-sm"
            />
          </div>
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">{l.taxiAddress} *</Label>
              <button
                type="button"
                disabled={state.geolocating}
                onClick={() => requestGeo(
                  locale,
                  (lat, lng) => { state.setLat(lat); state.setLng(lng); },
                  state.setAddress,
                  state.setGeolocating,
                  l,
                )}
                className="text-xs text-gold-600 hover:text-gold-700 disabled:opacity-50"
              >
                {state.geolocating ? l.locating : l.useMyLocation}
              </button>
            </div>
            <Input
              value={state.address}
              onChange={e => state.setAddress(e.target.value)}
              placeholder={l.taxiAddressPlaceholder}
              className="text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export interface BoardingDetailsStepProps {
  locale: string;
  l: WizardLabels;
  today: string;
  capacityStatus: 'ok' | 'limited' | 'full' | null;
  dogPets: Pet[];
  boarding: BoardingState;
  taxiGo: TaxiAddonState;
  taxiReturn: TaxiAddonState;
}

export function BoardingDetailsStep({
  locale, l, today, capacityStatus, dogPets, boarding, taxiGo, taxiReturn,
}: BoardingDetailsStepProps) {
  return (
    <div className="space-y-5">
      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="checkin">{l.checkIn} *</Label>
          <Input id="checkin" type="date" value={boarding.checkIn} onChange={e => boarding.setCheckIn(e.target.value)} min={today} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="checkout">{l.checkOut} *</Label>
          <Input id="checkout" type="date" value={boarding.checkOut} onChange={e => boarding.setCheckOut(e.target.value)} min={boarding.checkIn || today} className="mt-1" />
        </div>
      </div>

      {/* Pre-flight capacity warning for the chosen range */}
      {capacityStatus === 'limited' && (
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {locale === 'fr'
              ? 'Il reste peu de places pour ces dates — votre demande pourrait être refusée si la pension se remplit avant validation.'
              : 'Few spots left for these dates — your request may be declined if the boarding fills up before approval.'}
          </span>
        </div>
      )}
      {capacityStatus === 'full' && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {locale === 'fr'
              ? 'Pension complète sur ces dates — veuillez choisir une autre période.'
              : 'Boarding is full on these dates — please pick another period.'}
          </span>
        </div>
      )}

      {/* Availability Calendar — visual aid for BOARDING dates */}
      <div>
        <p className="text-xs text-gray-500 mb-2">
          {locale === 'fr' ? 'Disponibilités de la pension' : 'Boarding availability'}
        </p>
        <AvailabilityCalendar
          species={dogPets.length > 0 ? 'DOG' : 'CAT'}
          selectedStart={boarding.checkIn || null}
          selectedEnd={boarding.checkOut || null}
          interactive={false}
        />
      </div>

      {/* Grooming — dogs only */}
      {dogPets.length > 0 && (
        <div>
          <Label>{l.grooming} <span className="text-gold-600 font-medium">{l.groomingPrice}</span></Label>
          <p className="text-xs text-gray-500 mb-3">{l.groomingNote}</p>
          <div className="space-y-2">
            {dogPets.map(pet => (
              <div key={pet.id} className="flex items-center justify-between p-3 bg-ivory-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`groom-${pet.id}`}
                    checked={boarding.groomingPets[pet.id] || false}
                    onChange={e => boarding.setGroomingPets(p => ({ ...p, [pet.id]: e.target.checked }))}
                    className="w-4 h-4 accent-gold-500"
                  />
                  <label htmlFor={`groom-${pet.id}`} className="font-medium text-sm text-charcoal cursor-pointer">{pet.name}</label>
                </div>
                {boarding.groomingPets[pet.id] && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">{l.petSize}</Label>
                    <select
                      value={boarding.petSizes[pet.id] || 'SMALL'}
                      onChange={e => boarding.setPetSizes(p => ({ ...p, [pet.id]: e.target.value as PetSize }))}
                      className="text-xs border border-ivory-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="SMALL">{l.small} (+{GROOMING_PRICES.SMALL} MAD)</option>
                      <option value="LARGE">{l.large} (+{GROOMING_PRICES.LARGE} MAD)</option>
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pet Taxi Addon */}
      <div className="border border-ivory-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Car className="h-4 w-4 text-gold-500" />
          <span className="font-medium text-sm text-charcoal">{l.taxiAddonTitle}</span>
        </div>
        <p className="text-xs text-gray-500">{l.taxiAddonDesc}</p>
        <TaxiAddon locale={locale} l={l} today={today} state={taxiGo} idPrefix="taxi-go" title={l.taxiGo} dateLabel={l.taxiGoDate} />
        <TaxiAddon locale={locale} l={l} today={today} state={taxiReturn} idPrefix="taxi-return" title={l.taxiReturn} dateLabel={l.taxiReturnDate} />
      </div>

      <div>
        <Label htmlFor="notes">{l.notes}</Label>
        <Textarea id="notes" value={boarding.notes} onChange={e => boarding.setNotes(e.target.value)} placeholder={l.notesPlaceholder} rows={3} className="mt-1" />
      </div>
    </div>
  );
}
