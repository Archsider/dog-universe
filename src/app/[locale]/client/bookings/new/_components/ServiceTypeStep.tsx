'use client';

import { Car, Package } from 'lucide-react';
import type { BookingType } from '../_lib/types';
import type { WizardLabels } from '../_lib/i18n';

interface Props {
  bookingType: BookingType;
  setBookingType: (t: BookingType) => void;
  isPrefill: boolean;
  locale: string;
  l: WizardLabels;
}

export function ServiceTypeStep({ bookingType, setBookingType, isPrefill, locale, l }: Props) {
  return (
    <div className="space-y-4">
      {isPrefill && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          ✨ {locale === 'fr'
            ? 'Formulaire pré-rempli depuis votre dernière réservation'
            : 'Form pre-filled from your last booking'}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {([['BOARDING', l.boarding, l.boardingDesc, Package], ['PET_TAXI', l.taxi, l.taxiDesc, Car]] as const).map(([type, label, desc, Icon]) => (
          <button
            key={type}
            onClick={() => setBookingType(type as BookingType)}
            className={`p-5 rounded-xl border-2 text-left transition-all ${
              bookingType === type ? 'border-gold-400 bg-gold-50' : 'border-ivory-200 hover:border-gold-200'
            }`}
          >
            <Icon className={`h-8 w-8 mb-3 ${bookingType === type ? 'text-gold-500' : 'text-gray-400'}`} />
            <div className="font-semibold text-charcoal">{label}</div>
            <div className="text-sm text-gray-500 mt-1">{desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
