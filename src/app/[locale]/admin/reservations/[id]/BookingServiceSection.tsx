import { formatDate, formatMAD } from '@/lib/utils';
import { toNumber } from '@/lib/decimal';
import type { Decimal } from '@prisma/client/runtime/library';

const CANCELLATION_REASONS: Record<string, { fr: string; en: string }> = {
  plans_changed: { fr: 'Changement de plans',       en: 'Plans changed' },
  emergency:     { fr: 'Urgence personnelle',        en: 'Personal emergency' },
  found_other:   { fr: 'Autre solution trouvée',     en: 'Found another solution' },
  dates_changed: { fr: 'Dates modifiées',            en: 'Dates changed' },
  price:         { fr: 'Raison financière',          en: 'Financial reason' },
  other:         { fr: 'Autre',                      en: 'Other' },
};

interface BookingItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number | Decimal;
  total: number | Decimal;
}

interface BoardingDetail {
  includeGrooming: boolean;
  groomingStatus: string | null;
}

interface TaxiDetail {
  taxiType: string;
}

interface BookingServiceSectionProps {
  locale: string;
  isBoarding: boolean;
  serviceType: string;
  startDate: Date;
  endDate: Date | null;
  nights: number;
  notes: string | null;
  cancellationReason: string | null;
  boardingDetail: BoardingDetail | null;
  taxiDetail: TaxiDetail | null;
  bookingItems: BookingItem[];
  labels: {
    type: string;
    boarding: string;
    taxi: string;
    dates: string;
    grooming: string;
    no: string;
    taxiType: string;
    notes: string;
    cancelReason: string;
  };
}

export default function BookingServiceSection({
  locale,
  isBoarding,
  startDate,
  endDate,
  nights,
  notes,
  cancellationReason,
  boardingDetail,
  taxiDetail,
  bookingItems,
  labels: l,
}: BookingServiceSectionProps) {
  return (
    <>
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
        <h3 className="font-semibold text-charcoal mb-3 text-sm">
          {l.type} / {l.dates}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{l.type}</span>
            <span className="font-medium text-charcoal">{isBoarding ? l.boarding : l.taxi}</span>
          </div>

          {isBoarding ? (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">{l.dates}</span>
                <span className="font-medium text-charcoal">
                  {formatDate(startDate, locale)}
                  {endDate ? ` → ${formatDate(endDate, locale)}` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{locale === 'fr' ? 'Durée' : 'Duration'}</span>
                <span className="font-medium text-charcoal">
                  {nights} {locale === 'fr' ? 'nuit(s)' : 'night(s)'}
                </span>
              </div>
              {boardingDetail && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">{l.grooming}</span>
                  {boardingDetail.includeGrooming ? (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        boardingDetail.groomingStatus === 'DONE'
                          ? 'bg-green-100 text-green-700 border-green-200'
                          : boardingDetail.groomingStatus === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-700 border-blue-200'
                          : 'bg-amber-100 text-amber-700 border-amber-200'
                      }`}
                    >
                      {boardingDetail.groomingStatus === 'DONE'
                        ? locale === 'fr'
                          ? 'Terminé'
                          : 'Done'
                        : boardingDetail.groomingStatus === 'IN_PROGRESS'
                        ? locale === 'fr'
                          ? 'En cours'
                          : 'In progress'
                        : locale === 'fr'
                        ? 'Planifié'
                        : 'Planned'}
                    </span>
                  ) : (
                    <span className="font-medium text-gray-400 text-sm">{l.no}</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">{l.dates}</span>
                <span className="font-medium text-charcoal">{formatDate(startDate, locale)}</span>
              </div>
              {taxiDetail && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{l.taxiType}</span>
                  <span className="font-medium text-charcoal">{taxiDetail.taxiType}</span>
                </div>
              )}
            </>
          )}

          {notes && (
            <div className="mt-2 pt-2 border-t border-ivory-100">
              <p className="text-gray-500 text-xs mb-1">{l.notes}</p>
              <p className="text-charcoal">{notes}</p>
            </div>
          )}

          {cancellationReason && (
            <div className="mt-2 pt-2 border-t border-red-100">
              <p className="text-red-400 text-xs mb-1">{l.cancelReason}</p>
              <p className="text-charcoal font-medium">
                {CANCELLATION_REASONS[cancellationReason]?.[locale as 'fr' | 'en'] ?? cancellationReason}
              </p>
            </div>
          )}
        </div>
      </div>

      {bookingItems.length > 0 && (
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <h3 className="font-semibold text-charcoal mb-3 text-sm">
            {locale === 'fr' ? 'Produits / services additionnels' : 'Extra products / services'}
          </h3>
          <div className="border border-ivory-200 rounded-xl overflow-hidden">
            <div className="bg-ivory-50 px-3 py-2 grid grid-cols-[1fr_36px_72px_64px] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <span>{locale === 'fr' ? 'Description' : 'Description'}</span>
              <span className="text-center">{locale === 'fr' ? 'Qté' : 'Qty'}</span>
              <span className="text-right">P.U.</span>
              <span className="text-right">Total</span>
            </div>
            {bookingItems.map(item => (
              <div
                key={item.id}
                className="px-3 py-2 grid grid-cols-[1fr_36px_72px_64px] gap-2 border-t border-ivory-100 text-xs items-center"
              >
                <span className="text-charcoal">{item.description}</span>
                <span className="text-center text-gray-500">{item.quantity}</span>
                <span className="text-right text-gray-500">{formatMAD(item.unitPrice)}</span>
                <span className="text-right font-medium text-charcoal">{formatMAD(item.total)}</span>
              </div>
            ))}
            <div className="px-3 py-2 border-t border-gold-200/60 bg-ivory-50 flex justify-between items-center text-xs">
              <span className="font-semibold text-charcoal">
                {locale === 'fr' ? 'Sous-total additionnels' : 'Extras subtotal'}
              </span>
              <span className="font-bold text-gold-600">
                {formatMAD(bookingItems.reduce((s, i) => s + toNumber(i.total), 0))}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
