// Static label dictionaries for the admin booking detail page.
// Kept at the route level (not in a global i18n bundle) because these
// strings only render here and would pollute the shared catalog.

export type LocaleKey = 'fr' | 'en';

export interface DetailLabels {
  back: string;
  client: string;
  animals: string;
  type: string;
  boarding: string;
  taxi: string;
  dates: string;
  grooming: string;
  yes: string;
  no: string;
  taxiType: string;
  invoice: string;
  noInvoice: string;
  notes: string;
  cancelReason: string;
  originalBooking: string;
  pendingExtension: string;
  viewExtension: string;
  viewOriginal: string;
}

const LABELS: Record<LocaleKey, DetailLabels> = {
  fr: {
    back: 'Réservations',
    client: 'Client',
    animals: 'Animaux',
    type: 'Type',
    boarding: 'Pension',
    taxi: 'Taxi',
    dates: 'Dates',
    grooming: 'Toilettage',
    yes: 'Oui',
    no: 'Non',
    taxiType: 'Type de trajet',
    invoice: 'Facture liée',
    noInvoice: 'Aucune facture',
    notes: 'Notes client',
    cancelReason: "Motif d'annulation",
    originalBooking: "Réservation d'origine",
    pendingExtension: 'Extension en attente',
    viewExtension: 'Voir la demande',
    viewOriginal: "Voir la réservation d'origine",
  },
  en: {
    back: 'Bookings',
    client: 'Client',
    animals: 'Pets',
    type: 'Type',
    boarding: 'Boarding',
    taxi: 'Taxi',
    dates: 'Dates',
    grooming: 'Grooming',
    yes: 'Yes',
    no: 'No',
    taxiType: 'Trip type',
    invoice: 'Invoice',
    noInvoice: 'No invoice',
    notes: 'Client notes',
    cancelReason: 'Cancellation reason',
    originalBooking: 'Original booking',
    pendingExtension: 'Pending extension',
    viewExtension: 'View request',
    viewOriginal: 'View original booking',
  },
};

const STATUS_LBL: Record<LocaleKey, Record<string, string>> = {
  fr: {
    PENDING: 'En attente',
    CONFIRMED: 'Confirmé',
    AT_PICKUP: 'Sur place',
    CANCELLED: 'Annulé',
    REJECTED: 'Refusé',
    COMPLETED: 'Terminé',
    IN_PROGRESS: 'En cours',
    PENDING_EXTENSION: 'Extension en attente',
  },
  en: {
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    AT_PICKUP: 'At pickup',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
    COMPLETED: 'Completed',
    IN_PROGRESS: 'In progress',
    PENDING_EXTENSION: 'Extension pending',
  },
};

export function getLabels(locale: string): DetailLabels {
  return LABELS[(locale as LocaleKey) in LABELS ? (locale as LocaleKey) : 'fr'];
}

export function getStatusLabels(locale: string): Record<string, string> {
  return STATUS_LBL[(locale as LocaleKey) in STATUS_LBL ? (locale as LocaleKey) : 'fr'];
}
