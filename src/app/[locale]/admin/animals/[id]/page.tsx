import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, PawPrint, Calendar, ShieldCheck, ShieldAlert, ShieldOff, ShieldQuestion, Edit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { calculateAge, formatDate, getBookingStatusColor, getAntiparasiticDurationDays } from '@/lib/utils';
import { createSignedUrl } from '@/lib/supabase';
import DeleteAnimalButton from './DeleteAnimalButton';
import AntiparasiticUpdateButton from '@/components/admin/AntiparasiticUpdateButton';
import PetWeightHistorySection from '@/components/admin/PetWeightHistorySection';
import VaccinationSection from '@/components/pets/VaccinationSection';
import DocumentSection from '@/components/pets/DocumentSection';
import { PROOF_PREFIX } from '@/components/pets/constants';

interface PageProps { params: Promise<{ locale: string; id: string }> }

export default async function AdminAnimalDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/auth/login`);

  // Explicit select to avoid columns that may not exist in production DB yet
  // (migrations: 20260407_antiparasitic, 20260407_vaccination_draft)
  const rawPet = await prisma.pet.findUnique({
    where: { id },
    select: {
      id: true, ownerId: true, name: true, species: true, breed: true,
      dateOfBirth: true, gender: true, photoUrl: true,
      isNeutered: true, microchipNumber: true, tattooNumber: true, weight: true,
      vetName: true, vetPhone: true, allergies: true, currentMedication: true,
      behaviorWithDogs: true, behaviorWithCats: true, behaviorWithHumans: true, notes: true,
      lastAntiparasiticDate: true, antiparasiticProduct: true, antiparasiticNotes: true,
      antiparasiticDurationDays: true,
      createdAt: true, updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
      vaccinations: {
        select: { id: true, vaccineType: true, date: true, comment: true, createdAt: true, nextDueDate: true, status: true, isAutoDetected: true, sourceDocumentId: true },
        orderBy: { date: 'desc' },
      },
      documents: {
        select: { id: true, name: true, fileUrl: true, storageKey: true, fileType: true, uploadedAt: true },
        orderBy: { uploadedAt: 'desc' },
      },
      bookingPets: {
        select: {
          id: true,
          booking: { select: { id: true, status: true, serviceType: true, startDate: true } },
        },
        orderBy: { booking: { startDate: 'desc' } },
        take: 10,
      },
    },
  });

  if (!rawPet) notFound();

  const weightEntries = await prisma.petWeightEntry.findMany({
    where: { petId: id },
    orderBy: { measuredAt: 'desc' },
    select: { id: true, weightKg: true, measuredAt: true, note: true },
  });

  // Dates are serialized to ISO strings to avoid Next.js RSC serialization errors
  // when passing Date objects from Server Components to Client Components.
  const pet = {
    ...rawPet,
    lastAntiparasiticDate: rawPet.lastAntiparasiticDate ?? null,
    antiparasiticProduct: rawPet.antiparasiticProduct ?? null,
    antiparasiticNotes: rawPet.antiparasiticNotes ?? null,
    antiparasiticDurationDays: rawPet.antiparasiticDurationDays ?? null,
    vaccinations: rawPet.vaccinations.map(v => ({
      id: v.id,
      vaccineType: v.vaccineType,
      date: v.date ? v.date.toISOString() : null,
      comment: v.comment,
      nextDueDate: v.nextDueDate ? v.nextDueDate.toISOString() : null,
      status: v.status,
      isAutoDetected: v.isAutoDetected,
      sourceDocumentId: v.sourceDocumentId,
    })),
    documents: await Promise.all(rawPet.documents.map(async d => ({
      id: d.id,
      name: d.name,
      fileUrl: d.storageKey ? await createSignedUrl(d.storageKey) : d.fileUrl,
      fileType: d.fileType,
      uploadedAt: d.uploadedAt.toISOString(),
    }))),
  };

  const sl: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', CANCELLED: 'Annulé', REJECTED: 'Refusé', COMPLETED: 'Terminé', IN_PROGRESS: 'En cours' },
    en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', COMPLETED: 'Completed', IN_PROGRESS: 'In progress' },
  };

  function getAntiStatus(d: Date | null, product?: string | null, durationOverride?: number | null): 'up_to_date' | 'expiring_soon' | 'expired' | 'unknown' {
    if (!d) return 'unknown';
    const duration = getAntiparasiticDurationDays(product, durationOverride);
    const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (days <= duration - 5) return 'up_to_date';
    if (days <= duration) return 'expiring_soon';
    return 'expired';
  }

  const labels = {
    fr: { back: 'Animaux', owner: 'Propriétaire', species: 'Espèce', breed: 'Race', gender: 'Sexe', age: 'Âge', male: 'Mâle', female: 'Femelle', dog: 'Chien', cat: 'Chat', history: 'Historique', noHistory: 'Aucun séjour', weight: 'Poids', antiDate: 'Antiparasitaire', antiProduct: 'Produit', antiNotes: 'Notes antiparas.' },
    en: { back: 'Animals', owner: 'Owner', species: 'Species', breed: 'Breed', gender: 'Gender', age: 'Age', male: 'Male', female: 'Female', dog: 'Dog', cat: 'Cat', history: 'History', noHistory: 'No stays', weight: 'Weight', antiDate: 'Anti-parasitic', antiProduct: 'Product', antiNotes: 'Anti-par. notes' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const sl2 = sl[locale] || sl.fr;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${locale}/admin/animals`} className="text-gray-400 hover:text-charcoal"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-14 h-14 rounded-full bg-gold-100 flex items-center justify-center overflow-hidden">
            {pet.photoUrl ? <Image src={pet.photoUrl} alt={pet.name} width={56} height={56} className="w-14 h-14 object-cover" /> : <PawPrint className="h-7 w-7 text-gold-400" />}
          </div>
          <div>
            <h1 className="text-xl font-serif font-bold text-charcoal">{pet.name}</h1>
            <p className="text-sm text-gray-500">{pet.breed || (pet.species === 'DOG' ? l.dog : l.cat)}</p>
          </div>
        </div>
        <Link href={`/${locale}/admin/animals/${id}/edit`} className="flex items-center gap-1.5 text-sm text-charcoal/60 hover:text-charcoal border border-gray-200 rounded-md px-3 py-2 transition-colors mr-2">
          <Edit className="h-3.5 w-3.5" />
          {locale === 'fr' ? 'Modifier' : 'Edit'}
        </Link>
        <DeleteAnimalButton petId={id} petName={pet.name} locale={locale} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: info + history */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <h3 className="font-semibold text-charcoal text-sm mb-3">{locale === 'fr' ? 'Informations' : 'Information'}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">{l.species}</span><span className="text-charcoal">{pet.species === 'DOG' ? l.dog : l.cat}</span></div>
              {pet.breed && <div className="flex justify-between"><span className="text-gray-400">{l.breed}</span><span className="text-charcoal">{pet.breed}</span></div>}
              {pet.gender && <div className="flex justify-between"><span className="text-gray-400">{l.gender}</span><span className="text-charcoal">{pet.gender === 'MALE' ? l.male : l.female}</span></div>}
              {pet.dateOfBirth && <div className="flex justify-between"><span className="text-gray-400">{l.age}</span><span className="text-charcoal">{calculateAge(new Date(pet.dateOfBirth), locale)}</span></div>}
              {pet.weight !== null && pet.weight !== undefined && (
                <div className="flex justify-between"><span className="text-gray-400">{l.weight}</span><span className="text-charcoal font-medium">{pet.weight} kg</span></div>
              )}
              <div className="border-t border-ivory-100 pt-2">
                <span className="text-gray-400">{l.owner}</span>
                <Link href={`/${locale}/admin/clients/${pet.owner.id}`} className="block text-gold-600 hover:underline font-medium mt-0.5">{pet.owner.name}</Link>
              </div>
            </div>
          </div>

          {/* Anti-parasitic card */}
          {(() => {
            const antiStatus = getAntiStatus(pet.lastAntiparasiticDate, pet.antiparasiticProduct, pet.antiparasiticDurationDays);
            const iconMap = {
              up_to_date:    { Icon: ShieldCheck,    cls: 'text-green-600',  bg: 'bg-green-50',  label: locale === 'fr' ? 'À jour' : 'Up to date' },
              expiring_soon: { Icon: ShieldAlert,    cls: 'text-amber-600',  bg: 'bg-amber-50',  label: locale === 'fr' ? 'Expire bientôt' : 'Expiring soon' },
              expired:       { Icon: ShieldOff,      cls: 'text-red-600',    bg: 'bg-red-50',    label: locale === 'fr' ? 'Expiré' : 'Expired' },
              unknown:       { Icon: ShieldQuestion, cls: 'text-gray-400',   bg: 'bg-gray-50',   label: locale === 'fr' ? 'Non renseigné' : 'Not recorded' },
            };
            const { Icon, cls, bg, label } = iconMap[antiStatus];
            return (
              <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg}`}>
                      <Icon className={`h-4 w-4 ${cls}`} />
                    </div>
                    <h3 className="font-semibold text-charcoal text-sm">{locale === 'fr' ? 'Antiparasitaire' : 'Anti-parasitic'}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bg} ${cls}`}>{label}</span>
                    <AntiparasiticUpdateButton
                      petId={id}
                      locale={locale}
                      currentDate={pet.lastAntiparasiticDate ? pet.lastAntiparasiticDate.toISOString() : null}
                      currentProduct={pet.antiparasiticProduct}
                      currentNotes={pet.antiparasiticNotes}
                      currentDurationDays={pet.antiparasiticDurationDays}
                    />
                  </div>
                </div>
                <div className="space-y-1.5 text-sm">
                  {pet.lastAntiparasiticDate ? (
                    <div className="flex justify-between">
                      <span className="text-gray-400">{l.antiDate}</span>
                      <span className="text-charcoal">{formatDate(pet.lastAntiparasiticDate, locale)}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">{locale === 'fr' ? 'Aucune date enregistrée' : 'No date recorded'}</p>
                  )}
                  {pet.antiparasiticProduct && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">{l.antiProduct}</span>
                      <span className="text-charcoal">{pet.antiparasiticProduct}</span>
                    </div>
                  )}
                  {pet.lastAntiparasiticDate && (() => {
                    const effectiveDays = getAntiparasiticDurationDays(pet.antiparasiticProduct, pet.antiparasiticDurationDays);
                    const expiryDate = new Date(pet.lastAntiparasiticDate.getTime() + effectiveDays * 86400000);
                    return (
                      <div className="flex justify-between">
                        <span className="text-gray-400">{locale === 'fr' ? 'Prochain traitement' : 'Next treatment'}</span>
                        <span className="text-charcoal text-xs">{formatDate(expiryDate, locale)}{pet.antiparasiticDurationDays ? <span className="text-amber-600 ml-1">({pet.antiparasiticDurationDays}j)</span> : null}</span>
                      </div>
                    );
                  })()}
                  {pet.antiparasiticNotes && (
                    <p className="text-xs text-gray-500 pt-1 border-t border-ivory-100">{pet.antiparasiticNotes}</p>
                  )}
                </div>
              </div>
            );
          })()}

          <PetWeightHistorySection
            petId={id}
            locale={locale}
            initialEntries={weightEntries.map(e => ({
              id: e.id,
              weightKg: e.weightKg,
              measuredAt: e.measuredAt.toISOString(),
              note: e.note,
            }))}
            currentWeight={rawPet.weight}
          />

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

        {/* Right column: vaccinations (interactive) + documents */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <VaccinationSection
              petId={id}
              vaccinations={pet.vaccinations}
              documents={pet.documents.filter(d => d.name.startsWith(PROOF_PREFIX))}
              locale={locale}
            />
          </div>
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
            <DocumentSection
              petId={id}
              documents={pet.documents.filter(d => !d.name.startsWith(PROOF_PREFIX))}
              locale={locale}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
