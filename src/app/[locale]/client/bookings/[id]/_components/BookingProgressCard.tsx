import { Package, Car } from 'lucide-react';
import TaxiTimeline, { type TaxiTripData } from '@/components/shared/TaxiTimeline';
import BookingStepper from './BookingStepper';
import type { BookingDetailTranslations } from '../_lib/i18n';

interface BookingProgressCardProps {
  status: string;
  serviceType: string;
  standaloneTrip: TaxiTripData | null;
  locale: string;
  t: BookingDetailTranslations;
}

export default function BookingProgressCard({
  status,
  serviceType,
  standaloneTrip,
  locale,
  t,
}: BookingProgressCardProps) {
  const isBoarding = serviceType === 'BOARDING';

  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-2 rounded-lg ${isBoarding ? 'bg-gold-50' : 'bg-blue-50'}`}>
          {isBoarding
            ? <Package className="h-4 w-4 text-gold-500" />
            : <Car className="h-4 w-4 text-blue-500" />}
        </div>
        <div>
          <p className="font-semibold text-charcoal text-sm">{isBoarding ? t.boarding : t.taxi}</p>
          <p className="text-xs text-gray-400">{t.progression}</p>
        </div>
      </div>
      {isBoarding || !standaloneTrip
        ? <BookingStepper status={status} serviceType={serviceType} locale={locale} />
        : <TaxiTimeline trip={standaloneTrip} readOnly locale={locale} />}
    </div>
  );
}
