import {
  PawPrint, Car, Home, Clock, CalendarCheck, CheckCheck, MapPin,
} from 'lucide-react';

export const TAXI_LABELS: Record<string, Record<string, string>> = {
  STANDARD: { fr: 'Standard', en: 'Standard' },
  VET:      { fr: 'Vétérinaire', en: 'Veterinary' },
  AIRPORT:  { fr: 'Aéroport', en: 'Airport' },
};

// Mapping statut → bouton d'action BOARDING
export const BOARDING_NEXT: Record<string, { next: string; labelFr: string; labelEn: string }> = {
  PENDING:     { next: 'CONFIRMED',   labelFr: '✅ Confirmer',       labelEn: '✅ Confirm' },
  CONFIRMED:   { next: 'IN_PROGRESS', labelFr: '🏠 Marquer arrivée', labelEn: '🏠 Mark arrival' },
  IN_PROGRESS: { next: 'COMPLETED',   labelFr: '✅ Terminer séjour', labelEn: '✅ End stay' },
};

export type PensionColKey = 'pending' | 'confirmed' | 'inProgress' | 'completed';

export type PensionColConfig = {
  key: PensionColKey;
  label: { fr: string; en: string };
  sublabel: { fr: string; en: string };
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  dot: string;
};

export const PENSION_KANBAN_COLS: PensionColConfig[] = [
  {
    key: 'pending',
    label:    { fr: 'En attente',                en: 'Pending' },
    sublabel: { fr: 'Réservations à confirmer',  en: 'Awaiting confirmation' },
    icon: Clock,
    color: 'bg-amber-50 border-amber-100',
    dot:   'bg-amber-400',
  },
  {
    key: 'confirmed',
    label:    { fr: 'Confirmé',          en: 'Confirmed' },
    sublabel: { fr: 'Séjours confirmés', en: 'Confirmed stays' },
    icon: CalendarCheck,
    color: 'bg-blue-50 border-blue-100',
    dot:   'bg-blue-400',
  },
  {
    key: 'inProgress',
    label:    { fr: 'En cours',                  en: 'In progress' },
    sublabel: { fr: 'Actuellement en pension',   en: 'Currently boarding' },
    icon: Home,
    color: 'bg-green-50 border-green-100',
    dot:   'bg-green-400',
  },
  {
    key: 'completed',
    label:    { fr: 'Terminé (7j)',      en: 'Completed (7d)' },
    sublabel: { fr: 'Séjours terminés',  en: 'Finished stays' },
    icon: CheckCheck,
    color: 'bg-gray-50 border-gray-100',
    dot:   'bg-gray-300',
  },
];

export type TaxiColConfig = {
  status: string;
  label: { fr: string; en: string };
  sublabel: { fr: string; en: string };
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  dot: string;
};

// ALLER = OUTBOUND + STANDALONE
export const ALLER_COLS: TaxiColConfig[] = [
  {
    status: 'PLANNED',
    label:    { fr: 'Planifié',        en: 'Planned' },
    sublabel: { fr: 'Trajets à venir', en: 'Upcoming rides' },
    icon: Clock,
    color: 'bg-amber-50 border-amber-200',
    dot:   'bg-amber-400',
  },
  {
    status: 'EN_ROUTE_TO_CLIENT',
    label:    { fr: 'En route',             en: 'En route' },
    sublabel: { fr: 'Véhicule en approche', en: 'Vehicle approaching' },
    icon: Car,
    color: 'bg-sky-50 border-sky-200',
    dot:   'bg-sky-500',
  },
  {
    status: 'ON_SITE_CLIENT',
    label:    { fr: 'Arrivé chez le client', en: 'On site' },
    sublabel: { fr: 'Chez le client',        en: 'At client location' },
    icon: MapPin,
    color: 'bg-teal-50 border-teal-200',
    dot:   'bg-teal-500',
  },
  {
    status: 'ANIMAL_ON_BOARD',
    label:    { fr: 'Animal à bord',  en: 'Pet on board' },
    sublabel: { fr: 'Trajet en cours', en: 'Ride in progress' },
    icon: PawPrint,
    color: 'bg-cyan-50 border-cyan-200',
    dot:   'bg-cyan-600',
  },
  {
    status: 'ARRIVED_AT_PENSION',
    label:    { fr: 'Arrivé en pension',  en: 'At pension' },
    sublabel: { fr: 'Déposé avec succès', en: 'Successfully dropped off' },
    icon: Home,
    color: 'bg-green-50 border-green-200',
    dot:   'bg-green-500',
  },
];

// RETOUR = RETURN uniquement
export const RETOUR_COLS: TaxiColConfig[] = [
  {
    status: 'PLANNED',
    label:    { fr: 'Planifié',        en: 'Planned' },
    sublabel: { fr: 'Retours à venir', en: 'Upcoming returns' },
    icon: Clock,
    color: 'bg-amber-50 border-amber-200',
    dot:   'bg-amber-400',
  },
  {
    status: 'ANIMAL_ON_BOARD',
    label:    { fr: 'Animal à bord',        en: 'Pet on board' },
    sublabel: { fr: 'Départ de la pension', en: 'Departing pension' },
    icon: PawPrint,
    color: 'bg-orange-50 border-orange-200',
    dot:   'bg-orange-500',
  },
  {
    status: 'EN_ROUTE_TO_CLIENT',
    label:    { fr: 'En route',               en: 'En route' },
    sublabel: { fr: 'Trajet retour en cours', en: 'Return ride in progress' },
    icon: Car,
    color: 'bg-amber-100 border-amber-300',
    dot:   'bg-amber-600',
  },
  {
    status: 'ARRIVED_AT_CLIENT',
    label:    { fr: 'Rendu au client', en: 'At client' },
    sublabel: { fr: 'Retour terminé',  en: 'Return completed' },
    icon: Home,
    color: 'bg-green-50 border-green-200',
    dot:   'bg-green-500',
  },
];

export const ALLER_NEXT: Record<string, string> = {
  PLANNED:            'EN_ROUTE_TO_CLIENT',
  EN_ROUTE_TO_CLIENT: 'ON_SITE_CLIENT',
  ON_SITE_CLIENT:     'ANIMAL_ON_BOARD',
  ANIMAL_ON_BOARD:    'ARRIVED_AT_PENSION',
};

export const RETOUR_NEXT: Record<string, string> = {
  PLANNED:            'ANIMAL_ON_BOARD',
  ANIMAL_ON_BOARD:    'EN_ROUTE_TO_CLIENT',
  EN_ROUTE_TO_CLIENT: 'ARRIVED_AT_CLIENT',
};

export const ALLER_ACTION_LABELS: Record<string, { fr: string; en: string }> = {
  PLANNED:            { fr: 'En route',               en: 'En route' },
  EN_ROUTE_TO_CLIENT: { fr: 'Arrivé chez le client',  en: 'Arrived at client' },
  ON_SITE_CLIENT:     { fr: 'Animal à bord',          en: 'Pet on board' },
  ANIMAL_ON_BOARD:    { fr: 'Arrivé en pension',      en: 'At pension' },
};

export const RETOUR_ACTION_LABELS: Record<string, { fr: string; en: string }> = {
  PLANNED:            { fr: 'Animal à bord',  en: 'Pet on board' },
  ANIMAL_ON_BOARD:    { fr: 'En route',       en: 'En route' },
  EN_ROUTE_TO_CLIENT: { fr: 'Rendu au client', en: 'At client' },
};

// Étapes courtes affichées sous chaque rond du stepper taxi
export const TAXI_STEP_SHORT: Record<string, { fr: string; en: string }> = {
  PLANNED:            { fr: 'Plan.',  en: 'Plan.' },
  EN_ROUTE_TO_CLIENT: { fr: 'Route',  en: 'Route' },
  ON_SITE_CLIENT:     { fr: 'Client', en: 'Client' },
  ANIMAL_ON_BOARD:    { fr: 'Bord',   en: 'Aboard' },
  ARRIVED_AT_PENSION: { fr: 'Pens.',  en: 'Pens.' },
  ARRIVED_AT_CLIENT:  { fr: 'Rendu',  en: 'Done' },
};

export const ALLER_FLOW = ['PLANNED', 'EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD', 'ARRIVED_AT_PENSION'];
export const RETOUR_FLOW = ['PLANNED', 'ANIMAL_ON_BOARD', 'EN_ROUTE_TO_CLIENT', 'ARRIVED_AT_CLIENT'];

export const TERMINAL_TAXI_STATUSES = new Set(['ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT']);
