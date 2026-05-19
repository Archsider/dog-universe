import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, PawPrint, Edit } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { calculateAge, formatDateShort, formatMAD, getAntiparasiticDurationDays } from '@/lib/utils';
import { createSignedUrl } from '@/lib/supabase';
import VaccinationSection from '@/components/pets/VaccinationSection';
import PetPassportHero from '@/components/pets/PetPassportHero';
import { PROOF_PREFIX } from '@/components/pets/constants';
import DocumentSection from '@/components/pets/DocumentSection';

type Params = { locale: string; id: string };

function getAntiparasiticStatus(lastDate: Date | null, product?: string | null): 'up_to_date' | 'expiring_soon' | 'expired' | 'unknown' {
  if (!lastDate) return 'unknown';
  const duration = getAntiparasiticDurationDays(product);
  const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000);
  if (days <= duration - 5) return 'up_to_date';
  if (days <= duration) return 'expiring_soon';
  return 'expired';
}

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
  const ar = locale === 'ar';
  const t3 = (frStr: string, arStr: string, enStr: string) => fr ? frStr : ar ? arStr : enStr;

  const rawPet = await prisma.pet.findUnique({
    where: { id },
    select: {
      id: true, ownerId: true, name: true, species: true, breed: true,
      dateOfBirth: true, gender: true, photoUrl: true,
      isNeutered: true, microchipNumber: true, tattooNumber: true, weight: true,
      isPermanentResident: true,
      vetName: true, vetPhone: true, allergies: true, currentMedication: true,
      behaviorWithDogs: true, behaviorWithCats: true, behaviorWithHumans: true, notes: true,
      lastAntiparasiticDate: true, antiparasiticProduct: true, antiparasiticNotes: true,
      createdAt: true, updatedAt: true,
      owner: { select: { name: true, email: true } },
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
          booking: {
            select: {
              id: true, status: true, serviceType: true,
              startDate: true, endDate: true, totalPrice: true,
              boardingDetail: { select: { includeGrooming: true } },
              taxiDetail: { select: { id: true } },
              invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
            },
          },
        },
        orderBy: { booking: { startDate: 'desc' } },
      },
    },
  });

  if (!rawPet) notFound();

  // Dates are serialized to ISO strings to avoid Next.js RSC serialization errors
  // when passing Date objects from Server Components to Client Components.
  const pet = {
    ...rawPet,
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
  if (session.user.role !== 'ADMIN' && pet.ownerId !== session.user.id) {
    redirect(`/${locale}/client/pets`);
  }

  const speciesLabel = pet.species === 'DOG' ? t3('Chien', 'كلب', 'Dog') : t3('Chat', 'قطة', 'Cat');
  const genderLabel = pet.gender === 'MALE' ? t3('Mâle', 'ذكر', 'Male') : pet.gender === 'FEMALE' ? t3('Femelle', 'أنثى', 'Female') : null;

  const serviceLabels: Record<string, string> = fr
    ? { BOARDING: 'Pension', PET_TAXI: 'Taxi' }
    : ar
    ? { BOARDING: 'نزالة', PET_TAXI: 'تاكسي' }
    : { BOARDING: 'Boarding', PET_TAXI: 'Taxi' };
  const bookingStatusLabels: Record<string, string> = fr
    ? { PENDING: 'En attente', CONFIRMED: 'Confirmée', COMPLETED: 'Terminée', CANCELLED: 'Annulée' }
    : ar
    ? { PENDING: 'قيد الانتظار', CONFIRMED: 'مؤكد', COMPLETED: 'منتهي', CANCELLED: 'ملغى' }
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
      {/* Compact back link — Feature #5 Wave 5 replaces the legacy header
          with the passport hero below ; we keep just the back arrow here. */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/${locale}/client/pets`}
          className="inline-flex items-center gap-1 text-sm text-charcoal/60 hover:text-charcoal"
        >
          <ArrowLeft className="h-4 w-4" />
          {fr ? 'Mes compagnons' : 'My pets'}
        </Link>
        <Link
          href={`/${locale}/client/pets/${pet.id}/edit`}
          className="inline-flex items-center gap-1 text-sm text-charcoal/60 hover:text-[#C9A84C]"
        >
          <Edit className="h-4 w-4" />
          {fr ? 'Modifier' : 'Edit'}
        </Link>
      </div>

      <PetPassportHero
        name={pet.name}
        species={pet.species}
        breed={pet.breed}
        gender={pet.gender}
        dateOfBirth={pet.dateOfBirth}
        photoUrl={pet.photoUrl}
        microchipNumber={pet.microchipNumber}
        isNeutered={pet.isNeutered}
        stayCount={pet.bookingPets.length}
        isPermanentResident={pet.isPermanentResident}
        locale={locale}
      />

      <div className="mt-6 flex items-center gap-3 mb-6 hidden">
        <Link href={`/${locale}/client/pets`} className="text-charcoal/50 hover:text-charcoal">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gold-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            {pet.photoUrl ? (
              <Image src={pet.photoUrl} alt={pet.name} width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
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
                {t3('Identité', 'الهوية', 'Identity')}
              </h3>
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label={t3('Espèce', 'النوع', 'Species')} value={speciesLabel} />
                {pet.breed && <Field label={t3('Race', 'السلالة', 'Breed')} value={pet.breed} />}
                {pet.dateOfBirth && (
                  <Field
                    label={t3('Naissance', 'تاريخ الميلاد', 'Born')}
                    value={`${formatDateShort(pet.dateOfBirth, locale)} (${calculateAge(pet.dateOfBirth)})`}
                  />
                )}
                {genderLabel && <Field label={t3('Sexe', 'الجنس', 'Gender')} value={genderLabel} />}
                {pet.weight !== null && pet.weight !== undefined && (
                  <Field label={t3('Poids', 'الوزن', 'Weight')} value={`${pet.weight} kg`} />
                )}
                {pet.isNeutered !== null && pet.isNeutered !== undefined && (
                  <Field
                    label={t3('Statut reproductif', 'الحالة التناسلية', 'Reproductive status')}
                    value={pet.isNeutered
                      ? t3('Stérilisé(e) / Castré(e)', 'مُعقَّم / مُخصِيّ', 'Neutered / Spayed')
                      : t3('Non stérilisé(e)', 'غير مُعقَّم', 'Not neutered')}
                  />
                )}
                {pet.microchipNumber && <Field label={t3('N° de puce', 'رقم الشريحة', 'Microchip')} value={pet.microchipNumber} />}
                {pet.tattooNumber && <Field label={t3('Tatouage', 'الوشم', 'Tattoo')} value={pet.tattooNumber} />}
                <Field label={t3('Séjours', 'الإقامات', 'Stays')} value={String(pet.bookingPets.length)} />
              </div>
            </div>

            {/* Vétérinaire */}
            {(pet.vetName || pet.vetPhone) && (
              <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
                <h3 className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide mb-4">
                  {t3('Vétérinaire', 'الطبيب البيطري', 'Veterinarian')}
                </h3>
                <div className="grid sm:grid-cols-2 gap-5">
                  {pet.vetName && <Field label={t3('Nom', 'الاسم', 'Name')} value={pet.vetName} />}
                  {pet.vetPhone && <Field label={t3('Téléphone', 'الهاتف', 'Phone')} value={pet.vetPhone} />}
                </div>
              </div>
            )}

            {/* Santé */}
            {(pet.allergies || pet.currentMedication) && (
              <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
                <h3 className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide mb-4">
                  {t3('Santé', 'الصحة', 'Health')}
                </h3>
                <div className="space-y-4">
                  {pet.allergies && (
                    <div className="border-b border-gray-50 pb-3">
                      <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">
                        {t3('Allergies / Conditions médicales', 'الحساسية / الحالات الطبية', 'Allergies / Medical conditions')}
                      </p>
                      <p className="font-medium text-charcoal">{pet.allergies}</p>
                    </div>
                  )}
                  {pet.currentMedication && (
                    <div className="border-b border-gray-50 pb-3">
                      <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">
                        {t3('Médication en cours', 'الدواء الحالي', 'Current medication')}
                      </p>
                      <p className="font-medium text-charcoal">{pet.currentMedication}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Antiparasitaire */}
            {(() => {
              const status = getAntiparasiticStatus(pet.lastAntiparasiticDate, pet.antiparasiticProduct);
              const statusConfig = {
                up_to_date:    { label: t3('À jour', 'محدَّث', 'Up to date'),             cls: 'bg-green-50 text-green-700 border-green-200' },
                expiring_soon: { label: t3('Expire bientôt', 'ينتهي قريبًا', 'Expiring soon'), cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                expired:       { label: t3('Expiré', 'منتهي الصلاحية', 'Expired'),     cls: 'bg-red-50 text-red-700 border-red-200' },
                unknown:       { label: t3('Non renseigné', 'غير مُسجَّل', 'Not recorded'), cls: 'bg-gray-50 text-gray-500 border-gray-200' },
              };
              const cfg = statusConfig[status];
              return (
                <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide">
                      {t3('Antiparasitaire', 'مضاد الطفيليات', 'Anti-parasitic treatment')}
                    </h3>
                    <span className={`text-xs font-semibold border rounded-full px-3 py-1 ${cfg.cls}`}>{cfg.label}</span>
                  </div>
                  <div className="space-y-3">
                    {pet.lastAntiparasiticDate ? (
                      <div className="border-b border-gray-50 pb-3">
                        <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">{t3('Dernière application', 'آخر علاج', 'Last treatment')}</p>
                        <p className="font-medium text-charcoal">{formatDateShort(pet.lastAntiparasiticDate, locale)}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-charcoal/40 italic">{t3('Aucune date enregistrée — pensez à mettre à jour le profil.', 'لم يتم تسجيل تاريخ — تذكر تحديث الملف الشخصي.', 'No date recorded — remember to update the profile.')}</p>
                    )}
                    {pet.antiparasiticProduct && (
                      <div className="border-b border-gray-50 pb-3">
                        <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">{t3('Produit', 'المنتج', 'Product')}</p>
                        <p className="font-medium text-charcoal">{pet.antiparasiticProduct}</p>
                      </div>
                    )}
                    {pet.antiparasiticNotes && (
                      <div>
                        <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">{fr ? 'Notes' : 'Notes'}</p>
                        <p className="text-charcoal">{pet.antiparasiticNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Comportement */}
            {(pet.behaviorWithDogs || pet.behaviorWithCats || pet.behaviorWithHumans) && (
              <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
                <h3 className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide mb-4">
                  {t3('Comportement', 'السلوك', 'Behavior')}
                </h3>
                <div className="grid sm:grid-cols-3 gap-5">
                  {pet.behaviorWithDogs && (
                    <Field
                      label={t3('Avec les chiens', 'مع الكلاب', 'With dogs')}
                      value={BEHAVIOR_LABELS[pet.behaviorWithDogs]?.[(fr ? 'fr' : 'en')] ?? pet.behaviorWithDogs}
                    />
                  )}
                  {pet.behaviorWithCats && (
                    <Field
                      label={t3('Avec les chats', 'مع القطط', 'With cats')}
                      value={BEHAVIOR_LABELS[pet.behaviorWithCats]?.[(fr ? 'fr' : 'en')] ?? pet.behaviorWithCats}
                    />
                  )}
                  {pet.behaviorWithHumans && (
                    <Field
                      label={t3('Avec les humains', 'مع البشر', 'With humans')}
                      value={BEHAVIOR_LABELS[pet.behaviorWithHumans]?.[(fr ? 'fr' : 'en')] ?? pet.behaviorWithHumans}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {pet.notes && (
              <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
                <h3 className="text-xs font-semibold text-charcoal/50 uppercase tracking-wide mb-3">
                  {t3('Notes spéciales', 'ملاحظات خاصة', 'Special notes')}
                </h3>
                <p className="text-charcoal whitespace-pre-wrap">{pet.notes}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Vaccinations ── */}
        <TabsContent value="vaccinations">
          <VaccinationSection
            petId={id}
            vaccinations={pet.vaccinations}
            documents={pet.documents.filter(d => d.name.startsWith(PROOF_PREFIX))}
            locale={locale}
          />
        </TabsContent>

        {/* ── Documents ── */}
        <TabsContent value="documents">
          <DocumentSection
            petId={id}
            documents={pet.documents.filter(d => !d.name.startsWith(PROOF_PREFIX))}
            locale={locale}
          />
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
                          {t3('+ Toilettage', '+ تزيين', '+ Grooming')}
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
                      {booking.invoice ? `${t3('Facture', 'فاتورة', 'Invoice')}: ${booking.invoice.invoiceNumber}` : ''}
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
