// Pet Passport hero — luxe identity card placed at the top of the pet
// detail page.  Mimics a real passport mockup : cover-feel gold accents,
// photo on the left like an ID page, structured "identity" rows on the
// right.  Replaces the previously flat header.
//
// Source : Wave 5 (UX classe mondiale, Feature #5).

import Image from 'next/image';
import { PawPrint, ShieldCheck, Calendar, Cpu } from 'lucide-react';

interface Props {
  name: string;
  species: 'DOG' | 'CAT' | string;
  breed: string | null;
  gender: string | null;
  dateOfBirth: Date | null;
  photoUrl: string | null;
  microchipNumber: string | null;
  isNeutered: boolean | null;
  stayCount: number;
  isPermanentResident: boolean;
  locale: string;
}

function ageString(dob: Date | null, locale: string): string {
  if (!dob) return locale === 'fr' ? 'Âge non renseigné' : 'Age unknown';
  const months = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
  const years = Math.floor(months / 12);
  const remM = Math.floor(months % 12);
  const fr = locale === 'fr';
  if (years === 0) return fr ? `${Math.floor(months)} mois` : `${Math.floor(months)} months`;
  if (remM === 0) return fr ? `${years} an${years > 1 ? 's' : ''}` : `${years} year${years > 1 ? 's' : ''}`;
  return fr
    ? `${years} an${years > 1 ? 's' : ''} ${remM} mois`
    : `${years} year${years > 1 ? 's' : ''} ${remM} months`;
}

export default function PetPassportHero({
  name, species, breed, gender, dateOfBirth, photoUrl, microchipNumber,
  isNeutered, stayCount, isPermanentResident, locale,
}: Props) {
  const fr = locale === 'fr';

  const speciesLabel = species === 'DOG' ? (fr ? 'Chien' : 'Dog')
                     : species === 'CAT' ? (fr ? 'Chat' : 'Cat')
                     : species;
  const genderLabel = gender === 'MALE' ? (fr ? 'Mâle' : 'Male')
                    : gender === 'FEMALE' ? (fr ? 'Femelle' : 'Female')
                    : '—';

  const dobStr = dateOfBirth
    ? new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'long', year: 'numeric' }).format(dateOfBirth)
    : '—';

  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1C1612] via-[#2A1E15] to-[#1C1612] shadow-[0_12px_40px_rgba(196,151,74,0.20)] border border-[#C9A84C]/30">
      {/* Header band — passport-y typography */}
      <div className="px-5 py-3 border-b border-[#C9A84C]/20 flex items-center justify-between bg-black/30">
        <div className="flex items-center gap-2">
          <PawPrint className="h-4 w-4 text-[#C9A84C]" />
          <p className="text-[10px] uppercase tracking-[3px] text-[#C9A84C] font-semibold">
            {fr ? 'Carnet personnel' : 'Personal passport'}
          </p>
        </div>
        <p className="text-[10px] uppercase tracking-[2px] text-[#F5EDD8]/60">Dog Universe</p>
      </div>

      <div className="grid grid-cols-3 gap-4 p-5">
        {/* Photo column — passport-ID style frame */}
        <div className="col-span-1">
          <div className="aspect-[3/4] rounded-md overflow-hidden bg-[#0A0A0F] border-2 border-[#C9A84C]/40 shadow-inner">
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt={name}
                width={300}
                height={400}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl text-[#C9A84C]/30">
                {species === 'CAT' ? '🐱' : '🐶'}
              </div>
            )}
          </div>
          {isPermanentResident && (
            <p className="text-[9px] uppercase tracking-[2px] text-[#C9A84C] text-center mt-2 font-bold">
              {fr ? '★ Résident permanent ★' : '★ Permanent resident ★'}
            </p>
          )}
        </div>

        {/* Identity column */}
        <div className="col-span-2 flex flex-col">
          <p className="text-[10px] uppercase tracking-[2px] text-[#C9A84C]/80">
            {fr ? 'Nom officiel' : 'Official name'}
          </p>
          <h1 className="font-serif text-3xl text-[#F5EDD8] font-bold mt-0.5 leading-tight">{name}</h1>
          <p className="text-sm text-[#F5EDD8]/70 italic mt-1">{breed || speciesLabel}</p>

          <div className="mt-4 space-y-2.5 text-[13px]">
            <Row icon={<Calendar className="h-3.5 w-3.5" />} label={fr ? 'Né(e) le' : 'Born on'}>
              {dobStr}
              <span className="text-[#F5EDD8]/50 ml-2">({ageString(dateOfBirth, locale)})</span>
            </Row>
            <Row icon={null} label={fr ? 'Sexe' : 'Sex'}>
              {genderLabel}
              {isNeutered != null && (
                <span className="text-[#F5EDD8]/50 ml-2">
                  · {isNeutered ? (fr ? 'stérilisé(e)' : 'neutered') : (fr ? 'entier' : 'intact')}
                </span>
              )}
            </Row>
            {microchipNumber && (
              <Row icon={<Cpu className="h-3.5 w-3.5" />} label={fr ? 'Puce' : 'Chip'}>
                <span className="font-mono text-[#C9A84C]">{microchipNumber}</span>
              </Row>
            )}
            <Row icon={<ShieldCheck className="h-3.5 w-3.5" />} label={fr ? 'Séjours' : 'Stays'}>
              <span className="font-bold text-[#C9A84C]">{stayCount}</span>
              <span className="text-[#F5EDD8]/50 ml-1">
                {fr
                  ? `chez Dog Universe`
                  : `at Dog Universe`}
              </span>
            </Row>
          </div>
        </div>
      </div>

      {/* Footer stamp band */}
      <div className="px-5 py-2 border-t border-[#C9A84C]/15 bg-black/30 flex items-center justify-between">
        <p className="text-[9px] text-[#F5EDD8]/40 font-mono uppercase">DU · Marrakech · MAR</p>
        <div className="text-[10px] text-[#C9A84C]/60 italic">
          {fr ? '« Plus qu\'un animal, un membre. »' : '"More than a pet, a member."'}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-20 flex items-center gap-1 text-[10px] uppercase tracking-[1.5px] text-[#C9A84C]/70 pt-0.5">
        {icon}
        {label}
      </div>
      <div className="flex-1 text-[#F5EDD8]">{children}</div>
    </div>
  );
}
