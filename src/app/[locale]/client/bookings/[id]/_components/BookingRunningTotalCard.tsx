import { Clock } from 'lucide-react';
import { formatMAD } from '@/lib/utils';

interface NonBoardingItem {
  id: string;
  description: string;
  total: number;
}

interface BookingRunningTotalCardProps {
  elapsedNights: number;
  elapsedBoardingTotal: number;
  nonBoardingItems: NonBoardingItem[];
  provisionalTotal: number;
  locale: string;
}

export default function BookingRunningTotalCard({
  elapsedNights,
  elapsedBoardingTotal,
  nonBoardingItems,
  provisionalTotal,
  locale,
}: BookingRunningTotalCardProps) {
  return (
    <div className="bg-gradient-to-br from-gold-50 to-white rounded-xl border border-gold-300 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-gold-600" />
        <h3 className="font-semibold text-charcoal text-sm">
          {locale === 'fr' ? 'Total en cours' : locale === 'ar' ? 'الإجمالي الجاري' : 'Running total'}
        </h3>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">
            {locale === 'fr'
              ? `Nuits écoulées (${elapsedNights})`
              : locale === 'ar'
              ? `الليالي المنقضية (${elapsedNights})`
              : `Nights elapsed (${elapsedNights})`}
          </span>
          <span className="text-charcoal">{formatMAD(elapsedBoardingTotal)}</span>
        </div>
        {nonBoardingItems.map((it) => (
          <div key={it.id} className="flex justify-between">
            <span className="text-gray-500">{it.description}</span>
            <span className="text-charcoal">{formatMAD(it.total)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 border-t border-gold-200 font-semibold">
          <span className="text-charcoal">
            {locale === 'fr' ? 'Total provisoire' : locale === 'ar' ? 'الإجمالي المؤقت' : 'Provisional total'}
          </span>
          <span className="text-gold-600 text-base">{formatMAD(provisionalTotal)}</span>
        </div>
        <p className="text-xs text-gray-400 italic pt-1">
          {locale === 'fr'
            ? 'Estimation au prorata des nuits déjà passées. Le total final figurera sur la facture.'
            : locale === 'ar'
            ? 'تقدير حسب الليالي المنقضية. سيظهر الإجمالي النهائي على الفاتورة.'
            : 'Pro-rata estimate based on nights elapsed. Final total will appear on the invoice.'}
        </p>
      </div>
    </div>
  );
}
