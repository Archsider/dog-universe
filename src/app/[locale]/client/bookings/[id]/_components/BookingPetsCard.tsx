import Link from 'next/link';
import Image from 'next/image';
import { PawPrint } from 'lucide-react';
import type { BookingDetailTranslations } from '../_lib/i18n';

interface Pet {
  id: string;
  name: string | null;
  photoUrl: string | null;
  breed: string | null;
  species: string;
}

interface BookingPet {
  id: string;
  pet: Pet;
}

interface BookingPetsCardProps {
  bookingPets: BookingPet[];
  locale: string;
  t: BookingDetailTranslations;
}

export default function BookingPetsCard({ bookingPets, locale, t }: BookingPetsCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <PawPrint className="h-4 w-4 text-gold-500" />
        <h3 className="font-semibold text-charcoal text-sm">{t.pets}</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {bookingPets.map(bp => (
          <Link
            key={bp.id}
            href={`/${locale}/client/pets/${bp.pet.id}`}
            className="flex items-center gap-2 px-3 py-1.5 bg-ivory-50 rounded-lg border border-[#F0D98A]/30 hover:border-gold-400 transition-colors"
          >
            {bp.pet.photoUrl ? (
              <Image src={bp.pet.photoUrl} alt={bp.pet.name ?? ''} width={24} height={24} className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gold-100 flex items-center justify-center text-xs font-bold text-gold-600">
                {bp.pet.name?.[0] ?? '?'}
              </div>
            )}
            <span className="text-sm font-medium text-charcoal">{bp.pet.name ?? '—'}</span>
            <span className="text-xs text-gray-400">{bp.pet.breed || bp.pet.species}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
