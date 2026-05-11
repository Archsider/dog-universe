import RequestAddonButton from '../RequestAddonButton';

interface BookingAddonCardProps {
  bookingId: string;
  locale: string;
}

export default function BookingAddonCard({ bookingId, locale }: BookingAddonCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-3">
      <div>
        <p className="font-semibold text-charcoal text-sm">
          {locale === 'fr' ? 'Un service en plus ?' : locale === 'ar' ? 'تحتاج خدمة إضافية؟' : 'Need an extra service?'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {locale === 'fr'
            ? 'Pet Taxi, toilettage ou autre — nous vous contactons rapidement.'
            : locale === 'ar'
            ? 'سيارة أجرة، تزيين أو غيره — سنتواصل معك قريبًا.'
            : 'Pet Taxi, grooming or other — we\'ll get back to you shortly.'}
        </p>
      </div>
      <RequestAddonButton bookingId={bookingId} locale={locale} />
    </div>
  );
}
