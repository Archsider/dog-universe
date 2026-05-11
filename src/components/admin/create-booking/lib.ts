import { PRICING_DEFAULTS, type TaxiType } from '@/lib/pricing-client';

export const WALK_IN = '__WALK_IN__';

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function todayMinusYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export const TAXI_TYPE_LABELS: {
  value: TaxiType;
  labelFr: string;
  labelEn: string;
  priceKey: keyof typeof PRICING_DEFAULTS;
}[] = [
  { value: 'STANDARD', labelFr: 'Course standard', labelEn: 'Standard trip', priceKey: 'taxi_standard' },
  { value: 'VET', labelFr: 'Transport vétérinaire', labelEn: 'Vet transport', priceKey: 'taxi_vet' },
  { value: 'AIRPORT', labelFr: 'Navette aéroport', labelEn: 'Airport shuttle', priceKey: 'taxi_airport' },
];

export interface Pet {
  id: string;
  name: string;
  species: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
}

export interface CustomLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface WalkInPet {
  name: string;
  species: 'DOG' | 'CAT';
  dateOfBirth: string;
}

export interface ValidateArgs {
  fr: boolean;
  isWalkIn: boolean;
  clientId: string;
  walkInName: string;
  walkInPets: WalkInPet[];
  selectedPetIds: string[];
  startDate: string;
  serviceType: 'BOARDING' | 'PET_TAXI';
  endDate: string;
  nights: number;
}

/** Translate API error code → locale message; falls back to "unexpected error". */
export function apiErrorMessage(code: string, fr: boolean): string {
  const m: Record<string, string> = {
    MISSING_CLIENT_ID: fr ? 'Client requis' : 'Client required',
    INVALID_PETS: fr ? 'Animaux invalides' : 'Invalid pets',
    SUNDAY_NOT_ALLOWED: fr ? 'Le taxi n\'est pas disponible le dimanche' : 'Taxi not available on Sundays',
    INVALID_TIME_SLOT: fr ? 'Horaire taxi invalide (10h–17h)' : 'Invalid taxi time slot (10am–5pm)',
  };
  return m[code] ?? (fr ? 'Erreur inattendue' : 'Unexpected error');
}

/** Returns an error message in the active locale, or null if valid. */
export function validateBookingForm(a: ValidateArgs): string | null {
  const { fr } = a;
  if (!a.clientId) return fr ? 'Sélectionnez un client' : 'Select a client';
  if (a.isWalkIn) {
    if (!a.walkInName.trim()) return fr ? 'Nom du client de passage requis' : 'Walk-in client name required';
    const valid = a.walkInPets.filter(p => p.name.trim().length > 0 && p.dateOfBirth);
    if (valid.length === 0) {
      return fr ? 'Ajoutez au moins un animal (nom + date de naissance)' : 'Add at least one pet (name + date of birth)';
    }
  } else if (a.selectedPetIds.length === 0) {
    return fr ? 'Sélectionnez au moins un animal' : 'Select at least one pet';
  }
  if (!a.startDate) return fr ? 'Date de début requise' : 'Start date required';
  if (a.serviceType === 'BOARDING' && !a.endDate) {
    return fr ? 'Date de fin requise pour la pension' : 'End date required for boarding';
  }
  if (a.serviceType === 'BOARDING' && a.nights === 0) {
    return fr ? 'La durée du séjour doit être d\'au moins 1 nuit' : 'Stay must be at least 1 night';
  }
  return null;
}
