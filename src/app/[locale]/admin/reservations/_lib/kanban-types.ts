// Types, constants, and pure helpers for ReservationsKanban.
// No 'use client' — this file is neutral (pure data, no React hooks).

export interface KanbanBooking {
  id: string;
  version: number;
  serviceType: 'BOARDING' | 'PET_TAXI';
  status: string;
  startDate: string;
  endDate: string | null;
  isOpenEnded: boolean;
  isWalkIn: boolean;
  arrivalTime: string | null;
  notes: string | null;
  clientName: string;
  clientId: string;
  pets: string;
}

export const BOARDING_COLS = [
  { status: 'WAITLIST',    label: { fr: "Liste d'attente",      en: 'Waitlist' },          color: 'bg-orange-50 border-orange-200', dot: 'bg-orange-400' },
  { status: 'PENDING',     label: { fr: 'Demande reçue',       en: 'Request received' },  color: 'bg-amber-50  border-amber-200',  dot: 'bg-amber-400' },
  { status: 'CONFIRMED',   label: { fr: 'Séjour confirmé',      en: 'Stay confirmed' },    color: 'bg-blue-50   border-blue-200',   dot: 'bg-blue-400' },
  { status: 'IN_PROGRESS', label: { fr: 'Dans nos murs',        en: 'Currently staying' }, color: 'bg-green-50  border-green-200',  dot: 'bg-green-400' },
  { status: 'COMPLETED',   label: { fr: 'Séjour terminé',       en: 'Stay completed' },    color: 'bg-gray-50   border-gray-200',   dot: 'bg-gray-400' },
];

export const TAXI_COLS = [
  { status: 'PENDING',     label: { fr: 'Transport planifié',              en: 'Transport planned' },    color: 'bg-amber-50  border-amber-200',  dot: 'bg-amber-400' },
  { status: 'CONFIRMED',   label: { fr: 'En route vers le point de départ', en: 'En route to pickup' },  color: 'bg-blue-50   border-blue-200',   dot: 'bg-blue-400' },
  { status: 'AT_PICKUP',   label: { fr: 'Sur place',                        en: 'At pickup point' },     color: 'bg-teal-50   border-teal-200',   dot: 'bg-teal-400' },
  { status: 'IN_PROGRESS', label: { fr: 'Animal à bord',                    en: 'Pet on board' },        color: 'bg-green-50  border-green-200',  dot: 'bg-green-400' },
  { status: 'COMPLETED',   label: { fr: 'Arrivé à destination',             en: 'Arrived' },             color: 'bg-gray-50   border-gray-200',   dot: 'bg-gray-400' },
];

// Centralisation des transitions par pipeline
export const BOARDING_NEXT_STATUS: Record<string, string> = {
  WAITLIST:    'PENDING',
  PENDING:     'CONFIRMED',
  CONFIRMED:   'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

export const TAXI_NEXT_STATUS: Record<string, string> = {
  PENDING:     'CONFIRMED',
  CONFIRMED:   'AT_PICKUP',
  AT_PICKUP:   'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

export const ACTION_LABELS: Record<'BOARDING' | 'PET_TAXI', Record<string, { fr: string; en: string }>> = {
  BOARDING: {
    WAITLIST:    { fr: 'Promouvoir en attente',       en: 'Promote to pending' },
    PENDING:     { fr: 'Confirmer le séjour',        en: 'Confirm stay' },
    CONFIRMED:   { fr: 'Marquer dans nos murs',       en: 'Mark as staying' },
    IN_PROGRESS: { fr: 'Clôturer le séjour',          en: 'Close stay' },
  },
  PET_TAXI: {
    PENDING:     { fr: 'Véhicule en route vers le point de départ', en: 'Vehicle en route to pickup' },
    CONFIRMED:   { fr: 'Véhicule sur place',            en: 'Vehicle on site' },
    AT_PICKUP:   { fr: 'Animal à bord',                en: 'Pet on board' },
    IN_PROGRESS: { fr: 'Arrivé à destination',         en: 'Mark arrived' },
  },
};

// Statuts pour lesquels un bouton "No Show" est pertinent
export const NO_SHOW_ELIGIBLE_STATUSES = new Set(['CONFIRMED', 'IN_PROGRESS']);

export type ApplyTransition = (
  bookingId: string,
  currentStatus: string,
  currentVersion: number,
  newStatus: string,
) => Promise<void>;

export function parseAddresses(notes: string | null): { departure: string | null; arrival: string | null } {
  if (!notes) return { departure: null, arrival: null };
  const departureMatch = notes.match(/Départ:\s*([^|]+)/);
  const arrivalMatch = notes.match(/Arrivée:\s*([^|]+)/);
  return {
    departure: departureMatch ? departureMatch[1].trim() : null,
    arrival: arrivalMatch ? arrivalMatch[1].trim() : null,
  };
}

export function formatShortDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short' });
}
