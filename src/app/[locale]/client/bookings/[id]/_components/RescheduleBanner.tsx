interface RescheduleBannerProps {
  locale: string;
}

export default function RescheduleBanner({ locale }: RescheduleBannerProps) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="mt-0.5 flex-shrink-0 text-amber-500">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-amber-800">
          {locale === 'fr'
            ? 'Votre demande de modification est en cours d\'examen'
            : locale === 'ar'
            ? 'طلب التعديل قيد المراجعة'
            : 'Your reschedule request is under review'}
        </p>
        <p className="mt-0.5 text-xs text-amber-700">
          {locale === 'fr'
            ? 'Notre équipe va traiter votre demande de modification de dates rapidement.'
            : locale === 'ar'
            ? 'سيعالج فريقنا طلب تغيير التواريخ قريبًا.'
            : 'Our team will process your date change request shortly.'}
        </p>
      </div>
    </div>
  );
}
