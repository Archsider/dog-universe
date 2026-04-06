import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowLeft, PawPrint, Edit } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { calculateAge, formatDateShort, formatMAD } from '@/lib/utils';
import VaccinationSection from '@/components/pets/VaccinationSection';
import DocumentSection from '@/components/pets/DocumentSection';

type Params = { locale: string; id: string };

const BEHAVIOR_LABELS: Record<string, Record<string, string>> = {
  SOCIABLE: { fr: 'Sociable', en: 'Sociable' },
  TOLERANT: { fr: 'Tolérant', en: 'Tolerant' },
  MONITOR:  { fr: 'À surveiller', en: 'Needs monitoring' },
  REACTIVE: { fr: 'Réactif', en: 'Reactive' },
};

export default async function PetDetailPage({ params }: { params: Promise<Params> }) {
  const { locale, id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations('pets');
  const fr = locale === 'fr';

  const pet = await prisma.pet.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, email: true } },
      vaccinations: { orderBy: { date: 'desc' } },
      documents: { orderBy: { uploadedAt: 'desc' } },
      bookingPets: {
        include: {
          booking: {
            include: {
              boardingDetail: true,
              taxiDetail: true,
              invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
            },
          },
        },
        orderBy: { booking: { startDate: 'desc' } },
      },
    },
  });

  if (!pet) notFound();
  if (session.user.role !== 'ADMIN' && pet.ownerId !== session.user.id) {
    redirect(`/${locale}/client/pets`);
  }

  const speciesLabel = pet.species === 'DOG' ? (fr ? 'Chien' : 'Dog') : (fr ? 'Chat' : 'Cat');
  const genderLabel = pet.gender === 'MALE' ? (fr ? 'Mâle' : 'Male') : pet.gender === 'FEMALE' ? (fr ? 'Femelle' : 'Female') : null;

  const serviceLabels: Record<string, string> = fr
    ? { BOARDING: 'Pension', PET_TAXI: 'Taxi' }
    : { BOARDING: 'Boarding', PET_TAXI: 'Taxi' };
  const bookingStatusLabels: Record<string, string> = fr
    ? { PENDING: 'En attente', CONFIRMED: 'Confirmée', COMPLETED: 'Terminée', CANCELLED: 'Annulée' }
    : { PENDING: 'Pending', CONFIRMED: 'Confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

  // Helper to render a profile info row
  const Field = ({ label, value }: { label: string; value: string }) => (
    <div className="border-b border-gray-50 pb-3">
      <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">{label}</p>
      <p className="font-medium text-charcoal">{value}</p>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${locale}/client/pets`} className="text-charcoal/50 hover:text-charcoal">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gold-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            {pet.photoUrl ? (
              <img src={pet.photoUrl} alt={pet.name} className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <PawPrint className="h-5 w-5 text-gold-500" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold text-charcoal">{pet.name}</h1>
            <p className="text-sm text-charcoal/50">{speciesLabel}{pet.breed ? ` — ${pet.breed}` : ''}</p>
          </div>
        </div>
        <Link href={`/${locale}/client/pets/${id}/edit`}
          className="flex items-center gap-1.5 text-sm text-charcoal/60 hover:text-charcoal border border-gray-200 rounded-md px-3 py-2 transition-colors">
          <Edit className="h-3.5 w-3.5" />
          {t('editPet')}
        </Link>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">{t('tabs.profile')}</TabsTrigger>
          <TabsTrigger value="vaccinations">{t('tabs.vaccinations')}</TabsTrigger>
          <TabsTrigger value="documents">{t('tabs.documents')}</TabsTrigger>
          <TabsTrigger value="history">{t('tabs.history')}</TabsTrigger>
        </TabsList>

        {/* ── Profile ── */}
        <TabsContent value="profile">
          <div className="space-y-5">

            {/* Identité */}
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
              <h3 className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide mb-4">
                {fr ? 'Identité' : 'Identity'}
              </h3>
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label={fr ? 'Espèce' : 'Species'} value={speciesLabel} />
                {pet.breed && <Field label={fr ? 'Race' : 'Breed'} value={pet.breed} />}
                {pet.dateOfBirth && (
                  <Field
                    label={fr ? 'Naissance' : 'Born'}
                    value={`${formatDateShort(pet.dateOfBirth, locale)} (${calculateAge(pet.dateOfBirth)})`}
                  />
                )}
                {genderLabel && <Field label={fr ? 'Sexe' : 'Gender'} value={genderLabel} />}
                {pet.weight !== null && pet.weight !== undefined && (
                  <Field label={fr ? 'Poids' : 'Weight'} value={`${pet.weight} kg`} />
                )}
                {pet.isNeutered !== null && pet.isNeutered !== undefined && (
                  <Field
                    label={fr ? 'Statut reproductif' : 'Reproductive status'}
                    value={pet.isNeutered
                      ? (fr ? 'Stérilisé(e) / Castré(e)' : 'Neutered / Spayed')
                      : (fr ? 'Non stérilisé(e)' : 'Not neutered')}
                  />
                )}
                {pet.microchipNumber && <Field label={fr ? 'N° de puce' : 'Microchip'} value={pet.microchipNumber} />}
                {pet.tattooNumber && <Field label={fr ? 'Tatouage' : 'Tattoo'} value={pet.tattooNumber} />}
                <Field label={fr ? 'Séjours' : 'Stays'} value={String(pet.bookingPets.length)} />
              </div>
            </div>

            {/* Vétérinaire */}
            {(pet.vetName || pet.vetPhone) && (
              <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
                <h3 className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide mb-4">
                  {fr ? 'Vétérinaire' : 'Veterinarian'}
                </h3>
                <div className="grid sm:grid-cols-2 gap-5">
                  {pet.vetName && <Field label={fr ? 'Nom' : 'Name'} value={pet.vetName} />}
                  {pet.vetPhone && <Field label={fr ? 'Téléphone' : 'Phone'} value={pet.vetPhone} />}
                </div>
              </div>
            )}

            {/* Santé */}
            {(pet.allergies || pet.currentMedication) && (
              <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
                <h3 className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide mb-4">
                  {fr ? 'Santé' : 'Health'}
                </h3>
                <div className="space-y-4">
                  {pet.allergies && (
                    <div className="border-b border-gray-50 pb-3">
                      <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">
                        {fr ? 'Allergies / Conditions médicales' : 'Allergies / Medical conditions'}
                      </p>
                      <p className="font-medium text-charcoal">{pet.allergies}</p>
                    </div>
                  )}
                  {pet.currentMedication && (
                    <div className="border-b border-gray-50 pb-3">
                      <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">
                        {fr ? 'Médication en cours' : 'Current medication'}
                      </p>
                      <p className="font-medium text-charcoal">{pet.currentMedication}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Comportement */}
            {(pet.behaviorWithDogs || pet.behaviorWithCats || pet.behaviorWithHumans) && (
              <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
                <h3 className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide mb-4">
                  {fr ? 'Comportement' : 'Behavior'}
                </h3>
                <div className="grid sm:grid-cols-3 gap-5">
                  {pet.behaviorWithDogs && (
                    <Field
                      label={fr ? 'Avec les chiens' : 'With dogs'}
                      value={BEHAVIOR_LABELS[pet.behaviorWithDogs]?.[locale] ?? pet.behaviorWithDogs}
                    />
                  )}
                  {pet.behaviorWithCats && (
                    <Field
                      label={fr ? 'Avec les chats' : 'With cats'}
                      value={BEHAVIOR_LABELS[pet.behaviorWithCats]?.[locale] ?? pet.behaviorWithCats}
                    />
                  )}
                  {pet.behaviorWithHumans && (
                    <Field
                      label={fr ? 'Avec les humains' : 'With humans'}
                      value={BEHAVIOR_LABELS[pet.behaviorWithHumans]?.[locale] ?? pet.behaviorWithHumans}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {pet.notes && (
              <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
                <h3 className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide mb-3">
                  {fr ? 'Notes spéciales' : 'Special notes'}
                </h3>
                <p className="text-charcoal whitespace-pre-wrap">{pet.notes}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Vaccinations ── */}
        <TabsContent value="vaccinations">
          <VaccinationSection petId={id} vaccinations={pet.vaccinations} locale={locale} />
        </TabsContent>

        {/* ── Documents ── */}
        <TabsContent value="documents">
          <DocumentSection petId={id} documents={pet.documents} locale={locale} />
        </TabsContent>

        {/* ── History ── */}
        <TabsContent value="history">
          <div className="space-y-3">
            {pet.bookingPets.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-8 text-center shadow-card">
                <p className="text-charcoal/50">{t('history.noHistory')}</p>
              </div>
            ) : (
              pet.bookingPets.map(({ booking }) => (
                <div key={booking.id} className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-medium text-charcoal text-sm">
                        {serviceLabels[booking.serviceType] ?? booking.serviceType}
                      </span>
                      {booking.boardingDetail?.includeGrooming && (
                        <span className="ml-2 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5">
                          {fr ? '+ Toilettage' : '+ Grooming'}
                        </span>
                      )}
                      <span className="text-charcoal/40 text-sm ml-2">
                        {formatDateShort(booking.startDate, locale)}
                        {booking.endDate && ` → ${formatDateShort(booking.endDate, locale)}`}
                      </span>
                    </div>
                    <Badge variant={
                      booking.status === 'COMPLETED' ? 'completed'
                      : booking.status === 'CANCELLED' ? 'cancelled'
                      : 'confirmed'
                    }>
                      {bookingStatusLabels[booking.status] ?? booking.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-charcoal/40">
                      {booking.invoice ? `${fr ? 'Facture' : 'Invoice'}: ${booking.invoice.invoiceNumber}` : ''}
                    </span>
                    <span className="font-semibold text-gold-700 text-sm">{formatMAD(booking.totalPrice)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
