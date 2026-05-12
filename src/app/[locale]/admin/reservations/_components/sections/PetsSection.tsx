'use client';

import type { BookingDetailPet } from '@/types/booking-detail';

const BEHAVIOR_LABELS: Record<string, Record<string, string>> = {
  fr: {
    SOCIABLE: 'Sociable', TOLERANT: 'Tolérant', MONITOR: 'À surveiller', REACTIVE: 'Réactif',
    MALE: 'Mâle', FEMALE: 'Femelle',
  },
  en: {
    SOCIABLE: 'Sociable', TOLERANT: 'Tolerant', MONITOR: 'Monitor', REACTIVE: 'Reactive',
    MALE: 'Male', FEMALE: 'Female',
  },
};

function AlertTag({ text }: { text: string }) {
  return (
    <span className="inline-block text-xs bg-red-50 text-red-700 border border-red-100 rounded px-2 py-0.5">
      ⚠️ {text}
    </span>
  );
}

function BehaviorPill({ value, locale }: { value: string; locale: string }) {
  const labels = BEHAVIOR_LABELS[locale] ?? BEHAVIOR_LABELS.fr;
  const color =
    value === 'SOCIABLE' ? 'bg-green-50 text-green-700' :
    value === 'TOLERANT' ? 'bg-blue-50 text-blue-700' :
    value === 'MONITOR' ? 'bg-amber-50 text-amber-700' :
    'bg-red-50 text-red-700';
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${color}`}>
      {labels[value] ?? value}
    </span>
  );
}

function PetCard({ pet, locale }: { pet: BookingDetailPet; locale: string }) {
  const fr = locale !== 'en';
  const labels = BEHAVIOR_LABELS[locale] ?? BEHAVIOR_LABELS.fr;
  const hasAlerts = pet.allergies || pet.currentMedication;

  return (
    <div className="border border-ivory-100 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        {pet.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pet.photoUrl} alt={pet.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-ivory-100 flex items-center justify-center text-xl flex-shrink-0">
            {pet.species === 'CAT' ? '🐱' : '🐶'}
          </div>
        )}
        <div>
          <p className="font-semibold text-charcoal">{pet.name}</p>
          <p className="text-xs text-gray-500">
            {pet.species === 'CAT' ? (fr ? 'Chat' : 'Cat') : (fr ? 'Chien' : 'Dog')}
            {pet.breed && ` · ${pet.breed}`}
            {pet.gender && ` · ${labels[pet.gender] ?? pet.gender}`}
          </p>
        </div>
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <div className="flex flex-wrap gap-1.5">
          {pet.allergies && <AlertTag text={`${fr ? 'Allergie' : 'Allergy'}: ${pet.allergies}`} />}
          {pet.currentMedication && <AlertTag text={`${fr ? 'Méd.' : 'Med.'}: ${pet.currentMedication}`} />}
        </div>
      )}

      {/* Behavior */}
      {(pet.behaviorWithDogs || pet.behaviorWithCats) && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-gray-400">{fr ? 'Comportement:' : 'Behavior:'}</span>
          {pet.behaviorWithDogs && (
            <BehaviorPill value={pet.behaviorWithDogs} locale={locale} />
          )}
        </div>
      )}

      {/* Notes */}
      {pet.notes && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">{pet.notes}</p>
      )}
    </div>
  );
}

export default function PetsSection({
  pets,
  locale,
}: {
  pets: BookingDetailPet[];
  locale: string;
}) {
  if (pets.length === 0) {
    return <p className="text-sm text-gray-400">{locale === 'fr' ? 'Aucun animal' : 'No pets'}</p>;
  }
  return (
    <div className="space-y-3">
      {pets.map((pet) => (
        <PetCard key={pet.id} pet={pet} locale={locale} />
      ))}
    </div>
  );
}
