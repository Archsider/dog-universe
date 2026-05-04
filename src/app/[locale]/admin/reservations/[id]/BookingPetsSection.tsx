import Link from 'next/link';

interface Pet {
  id: string;
  name: string;
  breed: string | null;
  species: string;
}

interface BookingPet {
  id: string;
  pet: Pet;
}

interface BookingPetsSectionProps {
  bookingPets: BookingPet[];
  locale: string;
  label: string;
}

export default function BookingPetsSection({ bookingPets, locale, label }: BookingPetsSectionProps) {
  return (
    <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
      <h3 className="font-semibold text-charcoal mb-3 text-sm">{label}</h3>
      <div className="space-y-2">
        {bookingPets.map(bp => (
          <div key={bp.id} className="flex items-center justify-between text-sm">
            <Link href={`/${locale}/admin/animals/${bp.pet.id}`} className="text-charcoal hover:text-gold-600 font-medium">
              {bp.pet.name}
            </Link>
            <span className="text-gray-400">{bp.pet.breed || bp.pet.species}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
