'use client';

import { formatMAD } from '@/lib/utils';
import { TAXI_TYPE_LABELS } from './lib';
import type { BookingFormState } from './useBookingFormState';

interface Pet { id: string; name: string; species: string }

interface Props {
  fr: boolean;
  pricing: Record<string, number>;
  nights: number;
  selectedPets: Pet[];
  form: BookingFormState;
}

export function ServiceSection({ fr, pricing, nights, selectedPets, form }: Props) {
  const {
    serviceType, setServiceType,
    startDate, setStartDate, endDate, setEndDate,
    groomingEnabled, setGroomingEnabled, groomingSize, setGroomingSize,
    taxiGoEnabled, setTaxiGoEnabled, taxiGoDate, setTaxiGoDate, taxiGoTime, setTaxiGoTime, taxiGoAddress, setTaxiGoAddress,
    taxiReturnEnabled, setTaxiReturnEnabled, taxiReturnDate, setTaxiReturnDate, taxiReturnTime, setTaxiReturnTime, taxiReturnAddress, setTaxiReturnAddress,
    taxiType, setTaxiType, taxiDate, setTaxiDate, taxiTime, setTaxiTime,
  } = form;

  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
        {fr ? 'Service principal' : 'Primary service'}
      </h3>

      <div className="flex gap-2 mb-4">
        {(['BOARDING', 'PET_TAXI'] as const).map(st => (
          <button
            key={st}
            type="button"
            onClick={() => setServiceType(st)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
              serviceType === st
                ? 'bg-charcoal text-white border-charcoal'
                : 'border-gray-200 text-gray-600 hover:border-gold-300'
            }`}
          >
            {st === 'BOARDING' ? (fr ? 'Pension' : 'Boarding') : (fr ? 'Taxi animalier' : 'Pet Taxi')}
          </button>
        ))}
      </div>

      {serviceType === 'BOARDING' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">
                {fr ? 'Arrivée *' : 'Check-in *'}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">
                {fr ? 'Départ *' : 'Check-out *'}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                min={startDate}
                className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
              />
            </div>
          </div>

          {nights > 0 && (
            <p className="text-xs text-gold-600 font-medium">
              {nights} {fr ? 'nuit(s)' : 'night(s)'}
              {nights > 32 && (
                <span className="ml-2 text-amber-600">
                  {fr ? '— tarif long séjour applicable' : '— long-stay rate applies'}
                </span>
              )}
            </p>
          )}

          <div className="rounded-xl border border-gray-100 p-3 space-y-2 bg-gray-50/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={groomingEnabled}
                onChange={e => setGroomingEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-gold-500"
              />
              <span className="text-sm font-medium text-charcoal">
                {fr ? 'Toilettage inclus' : 'Include grooming'}
              </span>
            </label>
            {groomingEnabled && selectedPets.filter(p => p.species === 'DOG').length > 0 && (
              <div className="flex gap-2 ml-6">
                {(['SMALL', 'LARGE'] as const).map(sz => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setGroomingSize(sz)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                      groomingSize === sz
                        ? 'bg-gold-50 border-gold-400 text-gold-700'
                        : 'border-gray-200 text-gray-500 hover:border-gold-300'
                    }`}
                  >
                    {sz === 'SMALL'
                      ? `${fr ? 'Petit chien' : 'Small dog'} — ${formatMAD(pricing.grooming_small_dog)}`
                      : `${fr ? 'Grand chien' : 'Large dog'} — ${formatMAD(pricing.grooming_large_dog)}`}
                  </button>
                ))}
              </div>
            )}
            {groomingEnabled && selectedPets.filter(p => p.species === 'DOG').length === 0 && (
              <p className="text-xs text-amber-600 ml-6">
                {fr ? 'Le toilettage s\'applique uniquement aux chiens.' : 'Grooming applies to dogs only.'}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 p-3 space-y-2 bg-gray-50/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={taxiGoEnabled}
                onChange={e => setTaxiGoEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-gold-500"
              />
              <span className="text-sm font-medium text-charcoal">
                {fr ? `Pet Taxi — Aller (${formatMAD(pricing.taxi_standard)})` : `Pet Taxi — Drop-off (${formatMAD(pricing.taxi_standard)})`}
              </span>
            </label>
            {taxiGoEnabled && (
              <div className="grid grid-cols-2 gap-2 ml-6">
                <input
                  type="date"
                  value={taxiGoDate}
                  onChange={e => setTaxiGoDate(e.target.value)}
                  placeholder={fr ? 'Date aller' : 'Drop-off date'}
                  className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                />
                <input
                  type="time"
                  value={taxiGoTime}
                  onChange={e => setTaxiGoTime(e.target.value)}
                  min="10:00"
                  max="17:00"
                  className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                />
                <input
                  type="text"
                  value={taxiGoAddress}
                  onChange={e => setTaxiGoAddress(e.target.value)}
                  placeholder={fr ? 'Adresse de départ' : 'Pick-up address'}
                  className="col-span-2 border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 p-3 space-y-2 bg-gray-50/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={taxiReturnEnabled}
                onChange={e => setTaxiReturnEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-gold-500"
              />
              <span className="text-sm font-medium text-charcoal">
                {fr ? `Pet Taxi — Retour (${formatMAD(pricing.taxi_standard)})` : `Pet Taxi — Pick-up (${formatMAD(pricing.taxi_standard)})`}
              </span>
            </label>
            {taxiReturnEnabled && (
              <div className="grid grid-cols-2 gap-2 ml-6">
                <input
                  type="date"
                  value={taxiReturnDate}
                  onChange={e => setTaxiReturnDate(e.target.value)}
                  placeholder={fr ? 'Date retour' : 'Return date'}
                  className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                />
                <input
                  type="time"
                  value={taxiReturnTime}
                  onChange={e => setTaxiReturnTime(e.target.value)}
                  min="10:00"
                  max="17:00"
                  className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                />
                <input
                  type="text"
                  value={taxiReturnAddress}
                  onChange={e => setTaxiReturnAddress(e.target.value)}
                  placeholder={fr ? 'Adresse de livraison' : 'Drop-off address'}
                  className="col-span-2 border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:border-gold-400"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {serviceType === 'PET_TAXI' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">
                {fr ? 'Date *' : 'Date *'}
              </label>
              <input
                type="date"
                value={taxiDate}
                onChange={e => setTaxiDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">
                {fr ? 'Heure (10h–17h) *' : 'Time (10am–5pm) *'}
              </label>
              <input
                type="time"
                value={taxiTime}
                onChange={e => setTaxiTime(e.target.value)}
                min="10:00"
                max="17:00"
                className="w-full border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-gold-400"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">
              {fr ? 'Type de taxi' : 'Taxi type'}
            </label>
            <div className="flex flex-col gap-1.5">
              {TAXI_TYPE_LABELS.map(tt => (
                <button
                  key={tt.value}
                  type="button"
                  onClick={() => setTaxiType(tt.value)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-all ${
                    taxiType === tt.value
                      ? 'bg-gold-50 border-gold-400 text-gold-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-gold-300'
                  }`}
                >
                  {fr ? tt.labelFr : tt.labelEn}
                  {' '}— {formatMAD(pricing[tt.priceKey])}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
