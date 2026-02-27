import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PawPrint, Plus, Calendar } from 'lucide-react';
import { calculateAge, formatDateShort } from '@/lib/utils';

type Params = { locale: string };

export default async function PetsPage({ params }: { params: Promise<Params> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations('pets');

  const pets = await prisma.pet.findMany({
    where: { ownerId: session.user.id },
    include: {
      vaccinations: { orderBy: { date: 'desc' }, take: 1 },
      _count: { select: { bookingPets: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const speciesLabel = (species: string) =>
    species === 'DOG'
      ? locale === 'fr' ? 'Chien' : 'Dog'
      : locale === 'fr' ? 'Chat' : 'Cat';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-charcoal">{t('title')}</h1>
          <p className="text-charcoal/50 text-sm mt-1">
            {pets.length} {locale === 'fr' ? `animal${pets.length > 1 ? 'aux' : ''}` : `pet${pets.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link
          href={`/${locale}/client/pets/new`}
          className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('addPet')}
        </Link>
      </div>

      {/* Pet grid */}
      {pets.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#F0D98A]/30">
          <PawPrint className="h-12 w-12 text-charcoal/20 mx-auto mb-4" />
          <p className="text-charcoal/60 mb-2">{t('noPets')}</p>
          <p className="text-charcoal/40 text-sm mb-4">{t('noPetsAction')}</p>
          <Link href={`/${locale}/client/pets/new`}
            className="inline-flex items-center gap-2 bg-gold-500 text-white px-5 py-2.5 rounded-md text-sm font-medium">
            <Plus className="h-4 w-4" />
            {t('addPet')}
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pets.map((pet) => (
            <Link key={pet.id} href={`/${locale}/client/pets/${pet.id}`}
              className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card hover:shadow-card-hover transition-all group">
              {/* Photo */}
              <div className="flex items-center gap-4 mb-4">
                <div className="h-16 w-16 rounded-full bg-gold-50 border-2 border-gold-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {pet.photoUrl ? (
                    <img src={pet.photoUrl} alt={pet.name} className="h-16 w-16 object-cover rounded-full" />
                  ) : (
                    <PawPrint className="h-7 w-7 text-gold-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif font-semibold text-charcoal text-lg group-hover:text-gold-700 transition-colors">
                    {pet.name}
                  </h3>
                  <p className="text-sm text-charcoal/50">
                    {speciesLabel(pet.species)} {pet.breed ? `— ${pet.breed}` : ''}
                  </p>
                </div>
              </div>

              {/* Info */}
              <div className="space-y-2">
                {pet.dateOfBirth && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-charcoal/50">
                      {locale === 'fr' ? 'Âge' : 'Age'}
                    </span>
                    <span className="font-medium text-charcoal">{calculateAge(pet.dateOfBirth)}</span>
                  </div>
                )}
                {pet.gender && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-charcoal/50">
                      {locale === 'fr' ? 'Sexe' : 'Gender'}
                    </span>
                    <span className="font-medium text-charcoal">
                      {pet.gender === 'MALE' ? (locale === 'fr' ? 'Mâle' : 'Male') : (locale === 'fr' ? 'Femelle' : 'Female')}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-charcoal/50">
                    {locale === 'fr' ? 'Séjours' : 'Stays'}
                  </span>
                  <span className="font-medium text-charcoal">{pet._count.bookingPets}</span>
                </div>
              </div>

              {/* Last vaccination */}
              {pet.vaccinations[0] && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-charcoal/40">
                    {locale === 'fr' ? 'Dernier vaccin:' : 'Last vaccine:'} {pet.vaccinations[0].vaccineType} · {formatDateShort(pet.vaccinations[0].date, locale)}
                  </p>
                </div>
              )}
            </Link>
          ))}

          {/* Add new */}
          <Link href={`/${locale}/client/pets/new`}
            className="bg-[#FAF6F0] border-2 border-dashed border-[#E2C048]/40 rounded-xl p-6 flex flex-col items-center justify-center text-charcoal/40 hover:text-gold-600 hover:border-gold-400 hover:bg-gold-50 transition-all min-h-[180px]">
            <Plus className="h-8 w-8 mb-2" />
            <span className="text-sm font-medium">{t('addPet')}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
