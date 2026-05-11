import { RebookButton } from '@/components/client/RebookButton';

interface BookingRebookCardProps {
  booking: {
    id: string;
    serviceType: 'BOARDING' | 'PET_TAXI';
    bookingPets: { pet: { id: string; name: string } }[];
    totalPrice: number;
  };
  locale: string;
}

export default function BookingRebookCard({ booking, locale }: BookingRebookCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal text-sm mb-3">
        {locale === 'fr' ? 'Réserver à nouveau' : locale === 'ar' ? 'احجز مجددًا' : 'Book again'}
      </h3>
      <RebookButton booking={booking} locale={locale} />
    </div>
  );
}
