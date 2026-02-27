import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowLeft, PawPrint, Edit, Plus, FileText, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { calculateAge, formatDateShort, formatDateShort as fds, formatMAD } from '@/lib/utils';
import VaccinationSection from '@/components/pets/VaccinationSection';
import DocumentSection from '@/components/pets/DocumentSection';

type Params = { locale: string; id: string };

export default async function PetDetailPage({ params }: { params: Promise<Params> }) {
  const { locale, id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations('pets');

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

  const speciesLabel = pet.species === 'DOG' ? (locale === 'fr' ? 'Chien' : 'Dog') : (locale === 'fr' ? 'Chat' : 'Cat');
  const genderLabel = pet.gender === 'MALE' ? (locale === 'fr' ? 'Mâle' : 'Male') : pet.gender === 'FEMALE' ? (locale === 'fr' ? 'Femelle' : 'Female') : null;

  const statusLabels: Record<string, Record<string, string>> = {
    fr: { BOARDING: 'Pension', PET_TAXI: 'Taxi', PENDING: 'En attente', CONFIRMED: 'Confirmée', COMPLETED: 'Terminée', CANCELLED: 'Annulée' },
    en: { BOARDING: 'Boarding', PET_TAXI: 'Taxi', PENDING: 'Pending', CONFIRMED: 'Confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled' },
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${locale}/client/pets`} className="text-charcoal/50 hover:text-charcoal">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gold-100 flex items-center justify-center overflow-hidden">
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
        </div>
        <Link href={`/${locale}/client/pets/${id}/edit`}
          className="flex items-center gap-1.5 text-sm text-charcoal/60 hover:text-charcoal border border-gray-200 rounded-md px-3 py-2 transition-colors">
          <Edit className="h-3.5 w-3.5" />
          {t('editPet')}
        </Link>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">{t('tabs.profile')}</TabsTrigger>
          <TabsTrigger value="vaccinations">{t('tabs.vaccinations')}</TabsTrigger>
          <TabsTrigger value="documents">{t('tabs.documents')}</TabsTrigger>
          <TabsTrigger value="history">{t('tabs.history')}</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile">
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
            <div className="grid sm:grid-cols-2 gap-5">
              {[
                { label: locale === 'fr' ? 'Espèce' : 'Species', value: speciesLabel },
                ...(pet.breed ? [{ label: locale === 'fr' ? 'Race' : 'Breed', value: pet.breed }] : []),
                ...(pet.dateOfBirth ? [{ label: locale === 'fr' ? 'Naissance' : 'Born', value: `${formatDateShort(pet.dateOfBirth, locale)} (${calculateAge(pet.dateOfBirth)})` }] : []),
                ...(genderLabel ? [{ label: locale === 'fr' ? 'Sexe' : 'Gender', value: genderLabel }] : []),
                { label: locale === 'fr' ? 'Séjours' : 'Stays', value: String(pet.bookingPets.length) },
              ].map((field) => (
                <div key={field.label} className="border-b border-gray-50 pb-3">
                  <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">{field.label}</p>
                  <p className="font-medium text-charcoal">{field.value}</p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Vaccinations */}
        <TabsContent value="vaccinations">
          <VaccinationSection petId={id} vaccinations={pet.vaccinations} locale={locale} />
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents">
          <DocumentSection petId={id} documents={pet.documents} locale={locale} />
        </TabsContent>

        {/* History */}
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
                        {statusLabels[locale]?.[booking.serviceType] ?? booking.serviceType}
                      </span>
                      <span className="text-charcoal/40 text-sm ml-2">
                        {formatDateShort(booking.startDate, locale)}
                        {booking.endDate && ` → ${formatDateShort(booking.endDate, locale)}`}
                      </span>
                    </div>
                    <Badge variant={booking.status === 'COMPLETED' ? 'completed' : booking.status === 'CANCELLED' ? 'cancelled' : 'confirmed'}>
                      {statusLabels[locale]?.[booking.status] ?? booking.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center text-sm text-charcoal/50">
                    <span>
                      {booking.boardingDetail?.includeGrooming
                        ? (locale === 'fr' ? '+ Toilettage' : '+ Grooming')
                        : ''}
                    </span>
                    <span className="font-semibold text-gold-700">{formatMAD(booking.totalPrice)}</span>
                  </div>
                  {booking.invoice && (
                    <div className="mt-2 text-xs text-charcoal/40">
                      {locale === 'fr' ? 'Facture:' : 'Invoice:'} {booking.invoice.invoiceNumber}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
