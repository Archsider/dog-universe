import { formatMAD } from '@/lib/utils';
import type { BookingDetailTranslations } from '../_lib/i18n';
import type { Prisma } from '@prisma/client';

type BoardingDetail = Prisma.BoardingDetailGetPayload<Record<string, never>> | null;
type TaxiDetail = Prisma.TaxiDetailGetPayload<Record<string, never>> | null;

interface BookingPricingCardProps {
  boardingDetail: BoardingDetail;
  taxiDetail: TaxiDetail;
  nights: number;
  invoiceAmount: number | null;
  totalPrice: number;
  t: BookingDetailTranslations;
}

export default function BookingPricingCard({
  boardingDetail,
  taxiDetail,
  nights,
  invoiceAmount,
  totalPrice,
  t,
}: BookingPricingCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal text-sm mb-3">{t.pricing}</h3>
      <div className="space-y-2 text-sm">
        {boardingDetail && (
          <>
            {Number(boardingDetail.pricePerNight) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t.boarding} × {nights} {t.nights}</span>
                <span className="text-charcoal">{formatMAD(Number(boardingDetail.pricePerNight) * nights)}</span>
              </div>
            )}
            {boardingDetail.includeGrooming && Number(boardingDetail.groomingPrice) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t.grooming}</span>
                <span className="text-charcoal">{formatMAD(boardingDetail.groomingPrice)}</span>
              </div>
            )}
            {Number(boardingDetail.taxiAddonPrice) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t.taxi}</span>
                <span className="text-charcoal">{formatMAD(boardingDetail.taxiAddonPrice)}</span>
              </div>
            )}
          </>
        )}
        {taxiDetail && Number(taxiDetail.price) > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">{t.taxi}</span>
            <span className="text-charcoal">{formatMAD(taxiDetail.price)}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 border-t border-ivory-100 font-semibold">
          <span className="text-charcoal">Total</span>
          <span className="text-gold-600 text-base">
            {invoiceAmount !== null ? formatMAD(invoiceAmount) : formatMAD(totalPrice)}
          </span>
        </div>
      </div>
    </div>
  );
}
