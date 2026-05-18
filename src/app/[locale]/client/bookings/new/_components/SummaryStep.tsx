'use client';

import { AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatMAD } from '@/lib/utils';
import type { BookingType, Pet, PriceItem, TaxiType } from '../_lib/types';
import { pick, type WizardLabels } from '../_lib/i18n';

// Locale → Intl date locale tag. AR uses Moroccan Arabic for the calendar
// (numerals automatically Eastern Arabic for users with that preference).
function dateLocaleFor(locale: string): string {
  if (locale === 'ar') return 'ar-MA';
  if (locale === 'fr') return 'fr-MA';
  return 'en-US';
}

export interface SummaryStepProps {
  locale: string;
  l: WizardLabels;
  bookingType: BookingType;
  selectedPetObjects: Pet[];
  checkIn: string;
  checkOut: string;
  nights: number;
  taxiType: TaxiType;
  pickupAddress: string;
  dropoffAddress: string;
  priceItems: PriceItem[];
  total: number;
}

export function SummaryStep({
  locale, l, bookingType, selectedPetObjects, checkIn, checkOut, nights,
  taxiType, pickupAddress, dropoffAddress, priceItems, total,
}: SummaryStepProps) {
  return (
    <div className="space-y-4">
      <div className="bg-ivory-50 rounded-xl p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{l.type}</span>
          <Badge variant="outline">{bookingType !== 'PET_TAXI' ? l.boarding : l.taxi}</Badge>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{l.animals}</span>
          <span className="font-medium text-charcoal">{selectedPetObjects.map(p => p.name).join(', ')}</span>
        </div>
        {bookingType === 'BOARDING' ? (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{l.dates}</span>
              <span className="font-medium text-charcoal">
                {new Date(checkIn).toLocaleDateString(dateLocaleFor(locale))} → {new Date(checkOut).toLocaleDateString(dateLocaleFor(locale))}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{l.duration}</span>
              <span className="font-medium text-charcoal">{nights} {nights > 1 ? l.nights : l.night}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{l.taxiTypeLabel}</span>
              <span className="font-medium text-charcoal">{taxiType === 'STANDARD' ? l.standard : taxiType === 'VET' ? l.vet : l.airport}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{l.pickup}</span>
              <span className="font-medium text-charcoal text-right max-w-[60%]">{pickupAddress}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{l.dropoff}</span>
              <span className="font-medium text-charcoal text-right max-w-[60%]">{dropoffAddress}</span>
            </div>
          </>
        )}

        {/* Price breakdown */}
        {priceItems.length > 0 && (
          <>
            <div className="border-t border-ivory-200 pt-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{l.breakdown}</p>
              <div className="space-y-1.5">
                {priceItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {item.description}
                      {item.quantity > 1 && <span className="text-gray-400"> × {item.quantity} × {formatMAD(item.unitPrice)}</span>}
                    </span>
                    <span className="font-medium text-charcoal">{formatMAD(item.total)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-ivory-200 pt-3 flex justify-between">
              <span className="font-semibold text-charcoal">{l.total}</span>
              <span className="font-bold text-lg text-gold-600">{formatMAD(total)}</span>
            </div>
          </>
        )}
      </div>
      <div className="flex items-start gap-2 bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <span>{pick(
          locale,
          'Le montant final sera confirmé par notre équipe.',
          'The final amount will be confirmed by our team.',
          'سيتم تأكيد المبلغ النهائي من قِبَل فريقنا.',
        )}</span>
      </div>
    </div>
  );
}
