import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { PawPrint, ChevronRight } from 'lucide-react';
import { calculateAge } from '@/lib/utils';
import CreateAnimalModal from './CreateAnimalModal';

interface PageProps {
  params: { locale: string };
  searchParams: { q?: string; species?: string };
}

export default async function AdminAnimalsPage({ params: { locale }, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const q = searchParams.q || '';
  const species = searchParams.species || '';

  const pets = await prisma.pet.findMany({
    where: {
      ...(q && { OR: [{ name: { contains: q } }, { breed: { contains: q } }, { owner: { name: { contains: q } } }] }),
      ...(species && { species }),
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      vaccinations: { select: { id: true } },
      _count: { select: { bookingPets: true } },
    },
    orderBy: { name: 'asc' },
  });

  const labels = {
    fr: { title: 'Animaux', search: 'Rechercher...', all: 'Tous', dogs: 'Chiens', cats: 'Chats', name: 'Nom', owner: 'Propriétaire', species: 'Espèce', age: 'Âge', vaccinations: 'Vaccins', stays: 'Séjours', noAnimals: 'Aucun animal', dog: 'Chien', cat: 'Chat' },
    en: { title: 'Animals', search: 'Search...', all: 'All', dogs: 'Dogs', cats: 'Cats', name: 'Name', owner: 'Owner', species: 'Species', age: 'Age', vaccinations: 'Vaccines', stays: 'Stays', noAnimals: 'No animals', dog: 'Dog', cat: 'Cat' },
  };
  const l = labels[locale as keyof typeof labels] || labels.fr;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{pets.length}</span>
          <CreateAnimalModal locale={locale} />
        </div>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <form className="relative flex-1 min-w-[200px]">
          <input name="q" defaultValue={q} placeholder={l.search} className="w-full pl-4 pr-4 py-2 border border-ivory-200 rounded-lg text-sm focus:outline-none focus:border-gold-400 bg-white" />
          <input type="hidden" name="species" value={species} />
        </form>
        <div className="flex gap-2">
          {[['', l.all], ['DOG', l.dogs], ['CAT', l.cats]].map(([val, lbl]) => (
            <Link key={val} href={`?species=${val}&q=${q}`}>
              <button className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${species === val ? 'bg-charcoal text-white' : 'bg-white border border-ivory-200 text-gray-600 hover:border-gold-300'}`}>{lbl}</button>
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        {pets.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><PawPrint className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>{l.noAnimals}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ivory-200 bg-ivory-50">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{l.name}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">{l.owner}</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">{l.species}</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">{l.age}</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">{l.vaccinations}</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">{l.stays}</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {pets.map(pet => (
                  <tr key={pet.id} className="border-b border-ivory-100 last:border-0 hover:bg-ivory-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gold-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {pet.photoUrl ? <img src={pet.photoUrl} alt={pet.name} className="w-8 h-8 object-cover rounded-full" /> : <PawPrint className="h-4 w-4 text-gold-400" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm text-charcoal">{pet.name}</p>
                          {pet.breed && <p className="text-xs text-gray-400">{pet.breed}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                      <Link href={`/${locale}/admin/clients/${pet.owner.id}`} className="hover:text-gold-600">{pet.owner.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-charcoal hidden sm:table-cell">{pet.species === 'DOG' ? l.dog : l.cat}</td>
                    <td className="px-4 py-3 text-center text-sm text-charcoal hidden lg:table-cell">{pet.dateOfBirth ? calculateAge(new Date(pet.dateOfBirth), locale) : '—'}</td>
                    <td className="px-4 py-3 text-center text-sm text-charcoal">{pet.vaccinations.length}</td>
                    <td className="px-4 py-3 text-center text-sm text-charcoal hidden sm:table-cell">{pet._count.bookingPets}</td>
                    <td className="px-4 py-3">
                      <Link href={`/${locale}/admin/animals/${pet.id}`}><ChevronRight className="h-4 w-4 text-gray-400 hover:text-gold-500" /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
