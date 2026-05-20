// Classe-mondiale presentation of a Pet Health Passport.
// Server component (no interactivity). Bilingual via the `locale` prop.

import Link from 'next/link';
import { AlertTriangle, Pill, Syringe, Stethoscope, Cpu, ShieldCheck, Calendar } from 'lucide-react';

const L = {
  fr: {
    pageTitle: 'Carnet de santé',
    issuedBy: 'Établi par',
    expiresAt: 'Expire le',
    owner: 'Propriétaire',
    identification: 'Identification',
    breed: 'Race',
    gender: 'Sexe',
    male: 'Mâle',
    female: 'Femelle',
    neutered: 'Stérilisé·e',
    notNeutered: 'Non stérilisé·e',
    weight: 'Poids',
    age: 'Âge',
    microchip: 'Puce électronique',
    tattoo: 'Tatouage',
    health: 'Santé',
    allergies: 'Allergies',
    currentMedication: 'Traitement en cours',
    antiparasitic: 'Antiparasitaire',
    lastDose: 'Dernière dose',
    none: 'Aucun',
    vet: 'Vétérinaire',
    callVet: 'Appeler',
    vaccinations: 'Vaccinations à jour',
    noVaccinations: 'Aucune vaccination confirmée',
    nextDue: 'Prochain rappel',
    expired: 'Lien expiré',
    expiredBody: 'Ce lien de partage du carnet de santé n\'est plus valide. Demandez un nouveau lien au propriétaire de l\'animal.',
    backHome: 'Retour à Dog Universe',
    confidential: 'Document strictement personnel. Ne pas diffuser publiquement.',
    languageToggle: 'EN',
    languageToggleHref: '?lang=en',
  },
  en: {
    pageTitle: 'Health Passport',
    issuedBy: 'Issued by',
    expiresAt: 'Expires',
    owner: 'Owner',
    identification: 'Identification',
    breed: 'Breed',
    gender: 'Sex',
    male: 'Male',
    female: 'Female',
    neutered: 'Neutered',
    notNeutered: 'Intact',
    weight: 'Weight',
    age: 'Age',
    microchip: 'Microchip',
    tattoo: 'Tattoo',
    health: 'Health',
    allergies: 'Allergies',
    currentMedication: 'Current medication',
    antiparasitic: 'Antiparasitic',
    lastDose: 'Last dose',
    none: 'None',
    vet: 'Veterinarian',
    callVet: 'Call',
    vaccinations: 'Up-to-date vaccinations',
    noVaccinations: 'No confirmed vaccinations',
    nextDue: 'Next due',
    expired: 'Link expired',
    expiredBody: 'This shared health-passport link is no longer valid. Ask the pet owner to issue a new one.',
    backHome: 'Back to Dog Universe',
    confidential: 'Strictly personal document. Do not share publicly.',
    languageToggle: 'FR',
    languageToggleHref: '?lang=fr',
  },
} as const;

interface PassportPet {
  name: string;
  species: string;
  breed: string | null;
  gender: string | null;
  isNeutered: boolean | null;
  ageLabel: string;
  photoUrl: string | null;
  microchipNumber: string | null;
  tattooNumber: string | null;
  weight: number | null;
  vetName: string | null;
  vetPhone: string | null;
  allergies: string | null;
  currentMedication: string | null;
  lastAntiparasiticDate: string | null;
  antiparasiticProduct: string | null;
  vaccinations: { id: string; vaccineType: string; dateLabel: string; nextDueLabel: string | null }[];
}

interface Props {
  locale: 'fr' | 'en';
  expiresAt: Date;
  ownerFirstName: string | null;
  pet: PassportPet;
}

const SPECIES_EMOJI: Record<string, string> = { DOG: '🐕', CAT: '🐈' };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs uppercase tracking-wide text-[#8A7E75]">{label}</span>
      <span className="text-sm text-[#2A2520] text-right font-medium">{value}</span>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Pill;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-[#C4974A]/20 shadow-[0_4px_14px_rgba(196,151,74,0.08)] overflow-hidden">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-[#C4974A]/15 bg-gradient-to-r from-[#FAF6F0] to-white">
        <Icon className="h-4 w-4 text-[#C4974A]" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#2A2520]">{title}</h2>
      </header>
      <div className="px-5 py-3">{children}</div>
    </section>
  );
}

export function PassportShell({ locale, expiresAt, ownerFirstName, pet }: Props) {
  const l = L[locale];
  const expiresAtLabel = expiresAt.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FAF6F0] to-[#FEFCF9] py-6 px-3 sm:py-10 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header bar */}
        <header className="flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[3px] text-[#C4974A] font-semibold">
              {l.issuedBy} <span className="font-serif normal-case tracking-normal text-[#2A2520]">Dog Universe</span>
            </p>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#2A2520] mt-0.5">
              {l.pageTitle}
            </h1>
          </div>
          <Link
            href={l.languageToggleHref}
            className="text-xs px-2.5 py-1 rounded-full border border-[#C4974A]/40 text-[#C4974A] hover:bg-[#C4974A]/10 transition-colors"
            aria-label="Toggle language"
          >
            {l.languageToggle}
          </Link>
        </header>

        {/* Hero card with photo + name */}
        <div className="bg-white rounded-3xl border border-[#C4974A]/30 shadow-[0_10px_30px_rgba(196,151,74,0.15)] overflow-hidden">
          <div className="relative bg-gradient-to-br from-[#1C1612] via-[#2A1E15] to-[#1C1612] p-5 sm:p-6">
            <div className="flex items-center gap-4">
              {pet.photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- external Supabase URL, next/image remote pattern not configured for arbitrary tokens. */
                <img
                  src={pet.photoUrl}
                  alt={pet.name}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-[#C4974A]/40 shadow-lg"
                />
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#C4974A]/20 border-2 border-[#C4974A]/40 flex items-center justify-center text-4xl">
                  {SPECIES_EMOJI[pet.species] ?? '🐾'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[#F5EDD8] truncate">
                  {pet.name}
                </h2>
                <p className="text-sm text-[#C9A84C] mt-1">
                  {pet.breed ?? (SPECIES_EMOJI[pet.species] ?? '🐾')}{pet.ageLabel ? ` · ${pet.ageLabel}` : ''}
                </p>
                {ownerFirstName && (
                  <p className="text-xs text-[#F5EDD8]/60 mt-2">
                    {l.owner}: <span className="text-[#F5EDD8]/80">{ownerFirstName}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="px-5 py-2.5 bg-[#FAF6F0] text-[10px] uppercase tracking-wider text-[#8A7E75] flex items-center justify-between">
            <span>{l.expiresAt}: {expiresAtLabel}</span>
            <span className="hidden sm:inline">{l.confidential}</span>
          </div>
        </div>

        {/* Identification */}
        <Section icon={Cpu} title={l.identification}>
          {pet.breed && <Row label={l.breed} value={pet.breed} />}
          {pet.gender && (
            <Row
              label={l.gender}
              value={`${pet.gender === 'MALE' ? l.male : l.female}${pet.isNeutered === true ? ` · ${l.neutered}` : pet.isNeutered === false ? ` · ${l.notNeutered}` : ''}`}
            />
          )}
          {typeof pet.weight === 'number' && pet.weight > 0 && (
            <Row label={l.weight} value={`${pet.weight} kg`} />
          )}
          {pet.microchipNumber && <Row label={l.microchip} value={<span className="font-mono text-xs">{pet.microchipNumber}</span>} />}
          {pet.tattooNumber && <Row label={l.tattoo} value={<span className="font-mono text-xs">{pet.tattooNumber}</span>} />}
        </Section>

        {/* Health */}
        {(pet.allergies || pet.currentMedication || pet.lastAntiparasiticDate) && (
          <Section icon={Pill} title={l.health}>
            {pet.allergies && (
              <Row
                label={l.allergies}
                value={
                  <span className="inline-flex items-start gap-1 text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="text-left">{pet.allergies}</span>
                  </span>
                }
              />
            )}
            {pet.currentMedication && <Row label={l.currentMedication} value={pet.currentMedication} />}
            {pet.lastAntiparasiticDate && (
              <Row
                label={l.antiparasitic}
                value={
                  <>
                    {pet.antiparasiticProduct ?? '—'}
                    <div className="text-xs text-[#8A7E75] mt-0.5">{l.lastDose}: {pet.lastAntiparasiticDate}</div>
                  </>
                }
              />
            )}
          </Section>
        )}

        {/* Vet */}
        {(pet.vetName || pet.vetPhone) && (
          <Section icon={Stethoscope} title={l.vet}>
            {pet.vetName && <Row label={l.vet} value={pet.vetName} />}
            {pet.vetPhone && (
              <Row
                label="Tel."
                value={
                  <a
                    href={`tel:${pet.vetPhone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C4974A]/10 text-[#C4974A] font-medium hover:bg-[#C4974A]/20 transition-colors"
                  >
                    📞 {pet.vetPhone}
                  </a>
                }
              />
            )}
          </Section>
        )}

        {/* Vaccinations */}
        <Section icon={Syringe} title={l.vaccinations}>
          {pet.vaccinations.length === 0 ? (
            <p className="text-sm text-[#8A7E75] italic py-2">{l.noVaccinations}</p>
          ) : (
            <ul className="divide-y divide-[#C4974A]/10">
              {pet.vaccinations.map(v => (
                <li key={v.id} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="text-sm font-medium text-[#2A2520] truncate">{v.vaccineType}</span>
                    </div>
                    <div className="text-xs text-[#8A7E75] mt-0.5 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {v.dateLabel}
                      {v.nextDueLabel && <span className="text-[#C4974A]">· {l.nextDue}: {v.nextDueLabel}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Footer */}
        <footer className="text-center pt-2 pb-6">
          <p className="text-[10px] uppercase tracking-wider text-[#8A7E75] sm:hidden mb-2">{l.confidential}</p>
          <Link href="/" className="text-xs text-[#C4974A] hover:underline">
            {l.backHome}
          </Link>
        </footer>
      </div>
    </main>
  );
}

export function ExpiredView({ locale }: { locale: 'fr' | 'en' }) {
  const l = L[locale];
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FAF6F0] to-[#FEFCF9] flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-3xl border border-[#C4974A]/30 shadow-[0_10px_30px_rgba(196,151,74,0.15)] p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-[#2A2520] mb-2">{l.expired}</h1>
        <p className="text-sm text-[#8A7E75] mb-6">{l.expiredBody}</p>
        <Link
          href="/"
          className="inline-block px-5 py-2 rounded-full bg-[#C4974A] text-white text-sm font-medium hover:bg-[#A8823F] transition-colors"
        >
          {l.backHome}
        </Link>
      </div>
    </main>
  );
}
