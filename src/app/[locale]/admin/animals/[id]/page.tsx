import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ArrowLeft, PawPrint, Shield, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { calculateAge, formatDate, formatDateShort, getBookingStatusColor } from '@/lib/utils';

interface PageProps { params: { locale: string; id: string } }

export default async function AdminAnimalDetailPage({ params: { locale, id } }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const pet = await prisma.pet.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      vaccinations: { orderBy: { date: 'desc' } },
      documents: { orderBy: { uploadedAt: 'desc' } },
      bookingPets: {
        include: { booking: true },
        orderBy: { booking: { startDate: 'desc' } },
        take: 10,
      },
    },
  });

  if (!pet) notFound();

  const sl: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', CANCELLED: 'Annulé', REJECTED: 'Refusé', COMPLETED: 'Terminé', IN_PROGRESS: 'En cours' },
    en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', COMPLETED: 'Completed', IN_PROGRESS: 'In progress' },
  };

  const labels = {
    fr: { back: 'Animaux', owner: 'Propriétaire', species: 'Espèce', breed: 'Race', gender: 'Sexe', age: 'Âge', male: 'Mâle', female: 'Femelle', dog: 'Chien', cat: 'Chat', vaccinations: 'Vaccinations', history: 'Historique', noVac: 'Aucune vaccination', noHistory: 'Aucun séjour' },
    en: { back: 'Animals', owner: 'Owner', species: 'Species', breed: 'Breed', gender: 'Gender', age: 'Age', male: 'Male', female: 'Female', dog: 'Dog', cat: 'Cat', vaccinations: 'Vaccinations', history: 'History', noVac: 'No vaccinations', noHistory: 'No stays' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const sl2 = sl[locale] || sl.fr;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${locale}/admin/animals`} className="text-gray-400 hover:text-charcoal"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-gold-100 flex items-center justify-center overflow-hidden">
            {pet.photoUrl ? <img src={pet.photoUrl} alt={pet.name} className="w-14 h-14 object-cover" /> : <PawPrint className="h-7 w-7 text-gold-400" />}
          </div>
          <div>
            <h1 className="text-xl font-serif font-bold text-charcoal">{pet.name}</h1>
            <p className="text-sm text-gray-500">{pet.breed || (pet.species === 'DOG' ? l.dog : l.cat)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <h3 className="font-semibold text-charcoal text-sm mb-3">{locale === 'fr' ? 'Informations' : 'Information'}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">{l.species}</span><span className="text-charcoal">{pet.species === 'DOG' ? l.dog : l.cat}</span></div>
              {pet.breed && <div className="flex justify-between"><span className="text-gray-400">{l.breed}</span><span className="text-charcoal">{pet.breed}</span></div>}
              {pet.gender && <div className="flex justify-between"><span className="text-gray-400">{l.gender}</span><span className="text-charcoal">{pet.gender === 'MALE' ? l.male : l.female}</span></div>}
              {pet.dateOfBirth && <div className="flex justify-between"><span className="text-gray-400">{l.age}</span><span className="text-charcoal">{calculateAge(new Date(pet.dateOfBirth), locale)}</span></div>}
              <div className="border-t border-ivory-100 pt-2">
                <span className="text-gray-400">{l.owner}</span>
                <Link href={`/${locale}/admin/clients/${pet.owner.id}`} className="block text-gold-600 hover:underline font-medium mt-0.5">{pet.owner.name}</Link>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <div className="flex items-center gap-2 mb-3"><Shield className="h-4 w-4 text-gold-500" /><h3 className="font-semibold text-charcoal text-sm">{l.vaccinations}</h3></div>
            {pet.vaccinations.length === 0 ? <p className="text-sm text-gray-400">{l.noVac}</p> : (
              <div className="space-y-2">
                {pet.vaccinations.map(v => (
                  <div key={v.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span className="font-medium text-charcoal">{v.vaccineType}</span>
                    </div>
                    <p className="text-xs text-gray-400 ml-3.5">{formatDateShort(v.date, locale)}{v.comment ? ` · ${v.comment}` : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <div className="flex items-center gap-2 mb-3"><Calendar className="h-4 w-4 text-gold-500" /><h3 className="font-semibold text-charcoal text-sm">{l.history}</h3></div>
            {pet.bookingPets.length === 0 ? <p className="text-sm text-gray-400">{l.noHistory}</p> : (
              <div className="space-y-2">
                {pet.bookingPets.map(bp => (
                  <Link key={bp.id} href={`/${locale}/admin/reservations/${bp.booking.id}`}>
                    <div className="flex items-center justify-between py-2 hover:bg-ivory-50 -mx-2 px-2 rounded">
                      <div>
                        <Badge className={`text-xs ${getBookingStatusColor(bp.booking.status)}`}>{sl2[bp.booking.status]}</Badge>
                        <span className="text-xs text-gray-400 ml-2">{bp.booking.serviceType === 'BOARDING' ? (locale === 'fr' ? 'Pension' : 'Boarding') : 'Taxi'}</span>
                      </div>
                      <span className="text-xs text-gray-400">{formatDate(bp.booking.startDate, locale)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
