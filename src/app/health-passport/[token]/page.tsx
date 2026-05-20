// Public Pet Health Passport page — NO locale prefix.
// Reached via `/health-passport/{token}`. The token (HMAC-signed with
// embedded 24h-72h TTL) is verified server-side; an invalid or expired
// token renders a friendly "expired" view without leaking pet metadata.
//
// PII reduction enforced server-side : owner first name only, no contact.
// Vet phone IS shown — that's the point of the document.

import { verifyPassportToken } from '@/lib/pet-passport-token';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { calculateAge, formatDate } from '@/lib/utils';
import { PassportShell, ExpiredView } from './_components/PassportShell';

type Params = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParams { lang?: string }

export default async function HealthPassportPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<SearchParams> }) {
  const { token } = await params;
  const { lang } = await searchParams;
  const locale: 'fr' | 'en' = lang === 'en' ? 'en' : 'fr';

  const verified = verifyPassportToken(token);
  if (!verified) {
    return <ExpiredView locale={locale} />;
  }

  const pet = await prisma.pet.findFirst({
    where: notDeleted({ id: verified.petId }),
    select: {
      id: true,
      name: true,
      species: true,
      breed: true,
      dateOfBirth: true,
      gender: true,
      photoUrl: true,
      isNeutered: true,
      microchipNumber: true,
      tattooNumber: true,
      weight: true,
      vetName: true,
      vetPhone: true,
      allergies: true,
      currentMedication: true,
      lastAntiparasiticDate: true,
      antiparasiticProduct: true,
      vaccinations: {
        where: { status: 'CONFIRMED' },
        orderBy: { date: 'desc' },
        take: 20,
        select: { id: true, vaccineType: true, date: true, nextDueDate: true },
      },
      owner: { select: { firstName: true, name: true } },
    },
  });

  if (!pet) return <ExpiredView locale={locale} />;

  const ownerFirstName = pet.owner?.firstName
    ?? (pet.owner?.name?.split(/\s+/)[0] ?? null);

  return (
    <PassportShell
      locale={locale}
      expiresAt={verified.expiresAt}
      ownerFirstName={ownerFirstName}
      pet={{
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        gender: pet.gender,
        isNeutered: pet.isNeutered,
        ageLabel: calculateAge(pet.dateOfBirth, locale),
        photoUrl: pet.photoUrl,
        microchipNumber: pet.microchipNumber,
        tattooNumber: pet.tattooNumber,
        weight: pet.weight,
        vetName: pet.vetName,
        vetPhone: pet.vetPhone,
        allergies: pet.allergies,
        currentMedication: pet.currentMedication,
        lastAntiparasiticDate: pet.lastAntiparasiticDate
          ? formatDate(pet.lastAntiparasiticDate, locale)
          : null,
        antiparasiticProduct: pet.antiparasiticProduct,
        vaccinations: pet.vaccinations.map(v => ({
          id: v.id,
          vaccineType: v.vaccineType,
          dateLabel: v.date ? formatDate(v.date, locale) : '—',
          nextDueLabel: v.nextDueDate ? formatDate(v.nextDueDate, locale) : null,
        })),
      }}
    />
  );
}

// Force noindex via metadata.
export const metadata = {
  robots: { index: false, follow: false },
  title: 'Pet Health Passport — Dog Universe',
};
