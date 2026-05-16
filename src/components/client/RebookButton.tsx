// Server Component (was 'use client' but no interactivity — just a Link + text).
// Both call sites (client/dashboard/page.tsx and BookingRebookCard) are Server
// Components, so rendering this server-side removes a client boundary cross
// and ships zero JS for this button.
import Link from 'next/link';
import { formatMAD } from '@/lib/utils';
import type { Decimal } from '@prisma/client/runtime/library';

type RebookBooking = {
  id: string;
  serviceType: 'BOARDING' | 'PET_TAXI';
  bookingPets: { pet: { id: string; name: string } }[];
  totalPrice: number | Decimal;
};

type Props = {
  booking: RebookBooking;
  locale: string;
  label?: string;
};

export function RebookButton({ booking, locale, label }: Props) {
  const petIds = booking.bookingPets.map((bp) => bp.pet.id).join(',');
  const petNames = booking.bookingPets.map((bp) => bp.pet.name).join(', ');

  const serviceLabel =
    booking.serviceType === 'BOARDING'
      ? locale === 'fr' ? 'Pension' : locale === 'ar' ? 'نزالة' : 'Boarding'
      : locale === 'fr' ? 'Taxi animalier' : locale === 'ar' ? 'سيارة أجرة للحيوانات' : 'Pet Taxi';

  const href = `/${locale}/client/bookings/new?petIds=${encodeURIComponent(petIds)}&serviceType=${booking.serviceType}&prefill=1`;

  const defaultLabel = locale === 'fr' ? '🔄 Réserver à nouveau' : locale === 'ar' ? '🔄 احجز مجددًا' : '🔄 Book again';

  return (
    <div className="space-y-2">
      <Link
        href={href}
        className="inline-flex items-center gap-2 border border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg px-4 py-2 text-sm transition-colors"
      >
        {label ?? defaultLabel}
      </Link>
      <p className="text-xs text-[#8A7E75]">
        {petNames} · {serviceLabel} · {formatMAD(booking.totalPrice)}
      </p>
    </div>
  );
}
