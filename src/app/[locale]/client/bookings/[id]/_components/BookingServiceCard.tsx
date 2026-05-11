import { Calendar, Clock, MapPin } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import TaxiTimeline, { type TaxiTripData } from '@/components/shared/TaxiTimeline';
import RequestExtensionButton from '../RequestExtensionButton';
import type { BookingDetailTranslations } from '../_lib/i18n';
import type { Prisma } from '@prisma/client';

type BoardingDetail = Prisma.BoardingDetailGetPayload<Record<string, never>> | null;
type TaxiDetail = Prisma.TaxiDetailGetPayload<Record<string, never>> | null;

interface BookingServiceCardProps {
  bookingId: string;
  isBoarding: boolean;
  status: string;
  startDate: Date;
  endDate: Date | null;
  arrivalTime: string | null;
  notes: string | null;
  nights: number;
  boardingDetail: BoardingDetail;
  taxiDetail: TaxiDetail;
  goTrip: TaxiTripData | null;
  returnTrip: TaxiTripData | null;
  taxiDeparture: string | null;
  taxiArrival: string | null;
  hasExtensionRequest: boolean;
  locale: string;
  t: BookingDetailTranslations;
}

export default function BookingServiceCard({
  bookingId,
  isBoarding,
  status,
  startDate,
  endDate,
  arrivalTime,
  notes,
  nights,
  boardingDetail,
  taxiDetail,
  goTrip,
  returnTrip,
  taxiDeparture,
  taxiArrival,
  hasExtensionRequest,
  locale,
  t,
}: BookingServiceCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <div className="space-y-2 text-sm">
        {isBoarding ? (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{t.arrival}</span>
              <span className="font-medium text-charcoal">{formatDate(startDate, locale)}</span>
            </div>
            {endDate && (
              <div className="flex justify-between">
                <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{t.departure}</span>
                <span className="font-medium text-charcoal">{formatDate(endDate, locale)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{t.duration}</span>
              <span className="font-semibold text-gold-600">{nights} {t.nights}</span>
            </div>
            {boardingDetail && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t.grooming}</span>
                <span className="font-medium text-charcoal">{boardingDetail.includeGrooming ? t.yes : t.no}</span>
              </div>
            )}
            {boardingDetail?.taxiGoEnabled && (
              <>
                <div className="mt-2 pt-2 border-t border-ivory-100">
                  <p className="text-xs font-semibold text-orange-700 mb-1">{locale === 'fr' ? 'Taxi aller — dépôt à la pension' : locale === 'ar' ? 'تاكسي الذهاب — التوصيل إلى الحضيرة' : 'Taxi go — drop-off at facility'}</p>
                </div>
                {boardingDetail.taxiGoDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{locale === 'fr' ? 'Date' : 'Date'}</span>
                    <span className="font-medium text-charcoal">{boardingDetail.taxiGoDate}{boardingDetail.taxiGoTime ? ` — ${boardingDetail.taxiGoTime}` : ''}</span>
                  </div>
                )}
                {boardingDetail.taxiGoAddress && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500 flex items-center gap-1.5 flex-shrink-0"><MapPin className="h-3.5 w-3.5 text-orange-400" />{locale === 'fr' ? 'Adresse' : locale === 'ar' ? 'العنوان' : 'Address'}</span>
                    <span className="font-medium text-charcoal text-right">{boardingDetail.taxiGoAddress}</span>
                  </div>
                )}
              </>
            )}
            {boardingDetail?.taxiReturnEnabled && (
              <>
                <div className="mt-2 pt-2 border-t border-ivory-100">
                  <p className="text-xs font-semibold text-orange-700 mb-1">{locale === 'fr' ? 'Taxi retour — récupération à domicile' : locale === 'ar' ? 'تاكسي العودة — الاستلام من المنزل' : 'Taxi return — pick-up at home'}</p>
                </div>
                {boardingDetail.taxiReturnDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{locale === 'fr' ? 'Date' : 'Date'}</span>
                    <span className="font-medium text-charcoal">{boardingDetail.taxiReturnDate}{boardingDetail.taxiReturnTime ? ` — ${boardingDetail.taxiReturnTime}` : ''}</span>
                  </div>
                )}
                {boardingDetail.taxiReturnAddress && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500 flex items-center gap-1.5 flex-shrink-0"><MapPin className="h-3.5 w-3.5 text-orange-400" />{locale === 'fr' ? 'Adresse' : locale === 'ar' ? 'العنوان' : 'Address'}</span>
                    <span className="font-medium text-charcoal text-right">{boardingDetail.taxiReturnAddress}</span>
                  </div>
                )}
              </>
            )}
            {/* Taxi addon timelines — read-only */}
            {goTrip && (
              <div className="mt-3 pt-3 border-t border-ivory-100">
                <p className="text-xs font-semibold text-orange-700 mb-2">
                  {locale === 'fr' ? '↗ Taxi aller' : locale === 'ar' ? '↗ تاكسي الذهاب' : '↗ Taxi go'}
                </p>
                <TaxiTimeline trip={goTrip} readOnly locale={locale} />
              </div>
            )}
            {returnTrip && (
              <div className="mt-3 pt-3 border-t border-ivory-100">
                <p className="text-xs font-semibold text-orange-700 mb-2">
                  {locale === 'fr' ? '↙ Taxi retour' : locale === 'ar' ? '↙ تاكسي العودة' : '↙ Taxi return'}
                </p>
                <TaxiTimeline trip={returnTrip} readOnly locale={locale} />
              </div>
            )}

            {['CONFIRMED', 'IN_PROGRESS'].includes(status) && endDate && (
              <div className="mt-3 pt-3 border-t border-ivory-100">
                <RequestExtensionButton
                  bookingId={bookingId}
                  currentEndDate={endDate}
                  hasExtensionRequest={hasExtensionRequest}
                  locale={locale}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-gray-500 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{t.dates}</span>
              <span className="font-medium text-charcoal">{formatDate(startDate, locale)}</span>
            </div>
            {arrivalTime && (
              <div className="flex justify-between">
                <span className="text-gray-500 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Heure</span>
                <span className="font-medium text-charcoal">{arrivalTime}</span>
              </div>
            )}
            {taxiDetail && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t.taxiType}</span>
                <span className="font-medium text-charcoal">{t.taxiTypes[taxiDetail.taxiType as keyof typeof t.taxiTypes] || taxiDetail.taxiType}</span>
              </div>
            )}
            {taxiDeparture && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 flex items-center gap-1.5 flex-shrink-0"><MapPin className="h-3.5 w-3.5 text-green-500" />{t.pickup}</span>
                <span className="font-medium text-charcoal text-right">{taxiDeparture}</span>
              </div>
            )}
            {taxiArrival && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 flex items-center gap-1.5 flex-shrink-0"><MapPin className="h-3.5 w-3.5 text-red-400" />{t.dropoff}</span>
                <span className="font-medium text-charcoal text-right">{taxiArrival}</span>
              </div>
            )}
          </>
        )}
        {notes && !notes.includes('Départ:') && !notes.includes('Arrivée:') && (
          <div className="mt-2 pt-2 border-t border-ivory-100">
            <p className="text-gray-400 text-xs mb-1">{t.notes}</p>
            <p className="text-charcoal italic">{notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
