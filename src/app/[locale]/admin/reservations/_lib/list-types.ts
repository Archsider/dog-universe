// Types, constants, and pure helpers for ReservationsList.
// No 'use client' — neutral file (no React hooks).

export type ReservationRow = {
  id: string;
  status: string;
  serviceType: 'BOARDING' | 'PET_TAXI';
  startDate: string;       // ISO
  endDate: string | null;  // ISO
  isOpenEnded: boolean;
  totalPrice: number;
  invoiceAmount: number | null;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    isWalkIn: boolean;
  };
  pets: { name: string; species: 'DOG' | 'CAT' }[];
  hasTaxi: boolean;       // standalone or addon
  taxiReturn: boolean;    // A+R if true
  taxiAddon: boolean;     // boarding + taxi addon
};

export type Filter =
  | 'ALL'
  | 'IN_PROGRESS'
  | 'CONFIRMED'
  | 'PENDING'
  | 'WALKIN'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'BOARDING'
  | 'PET_TAXI';

export const AVATAR_PALETTE = [
  { bg: '#FDE6CC', fg: '#8C4A0E' },
  { bg: '#E0F2F1', fg: '#0E5752' },
  { bg: '#FCE4EC', fg: '#7E1A48' },
  { bg: '#EEEDFE', fg: '#3C3489' },
  { bg: '#E6F1FB', fg: '#0C447C' },
  { bg: '#FFF4D2', fg: '#8C6B0E' },
  { bg: '#E5F6E0', fg: '#2D6019' },
  { bg: '#F4E1FA', fg: '#5C2076' },
];

export function colorFromName(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export function initialsFrom(first: string, last: string): string {
  const a = (first?.[0] ?? '').toUpperCase();
  const b = (last?.[0] ?? '').toUpperCase();
  return (a + b) || '?';
}

const FR_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatShort(iso: string, locale: string): string {
  const d = new Date(iso);
  const months = locale === 'fr' ? FR_MONTHS : EN_MONTHS;
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function nightsBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function nightsSince(startIso: string): number {
  const ms = Date.now() - new Date(startIso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

// "En cours" UI = IN_PROGRESS UNIQUEMENT (chien physiquement présent).
// CONFIRMED = réservé mais pas encore arrivé → exclu.
export function isInProgressNow(b: ReservationRow): boolean {
  return b.status === 'IN_PROGRESS';
}

// Open-ended = walk-in flag OR no endDate set. Both treated identically.
export function isOpenEndedRow(b: ReservationRow): boolean {
  return b.isOpenEnded || b.endDate == null;
}

export type ListTranslations = {
  title: string;
  subActiveStays: string;
  subWalkIns: string;
  inProgress: string;
  confirmed: string;
  pending: string;
  walkInsOpen: string;
  cancelled: string;
  noShow: string;
  revenueMonth: string;
  all: string;
  walkin: string;
  boarding: string;
  taxi: string;
  search: string;
  export: string;
  create: string;
  none: string;
  nights: string;
  nightsOngoing: string;
  provisional: string;
  cols: { client: string; animals: string; status: string; dates: string; services: string; total: string };
  statusLabel: Record<string, string>;
  taxiOneway: string;
  taxiRoundtrip: string;
  boardingBadge: string;
};

export function buildTranslations(locale: string): ListTranslations {
  if (locale === 'en') return {
    title: 'Bookings',
    subActiveStays: 'active stays',
    subWalkIns: 'open walk-ins',
    inProgress: 'In progress',
    confirmed: 'Confirmed',
    pending: 'Pending',
    walkInsOpen: 'Open walk-ins',
    cancelled: 'Cancelled',
    noShow: 'No-show',
    revenueMonth: 'Revenue this month',
    all: 'All',
    walkin: 'Walk-in',
    boarding: 'Boarding',
    taxi: 'Taxi',
    search: 'Search client or pet…',
    export: 'Export',
    create: 'New booking',
    none: 'No bookings',
    nights: 'nights',
    nightsOngoing: 'nights ongoing',
    provisional: 'provisional',
    cols: { client: 'Client', animals: 'Pets', status: 'Status', dates: 'Dates', services: 'Services', total: 'Total' },
    statusLabel: { IN_PROGRESS: 'In progress', PENDING: 'Pending', WALKIN: 'Walk-in', COMPLETED: 'Completed', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', AT_PICKUP: 'At pickup', PENDING_EXTENSION: 'Extension', NO_SHOW: 'No-show', WAITLIST: 'Waitlist' },
    taxiOneway: 'One-way taxi',
    taxiRoundtrip: 'Round-trip taxi',
    boardingBadge: 'Boarding',
  };
  return {
    title: 'Réservations',
    subActiveStays: 'séjours actifs',
    subWalkIns: 'walk-ins ouverts',
    inProgress: 'En cours',
    confirmed: 'Confirmées',
    pending: 'En attente',
    walkInsOpen: 'Walk-ins ouverts',
    cancelled: 'Annulées',
    noShow: 'No-show',
    revenueMonth: 'CA ce mois',
    all: 'Toutes',
    walkin: 'Walk-in',
    boarding: 'Pension',
    taxi: 'Taxi',
    search: 'Rechercher client ou animal…',
    export: 'Exporter',
    create: 'Nouvelle réservation',
    none: 'Aucune réservation',
    nights: 'nuits',
    nightsOngoing: 'nuits en cours',
    provisional: 'provisoire',
    cols: { client: 'Client', animals: 'Animaux', status: 'Statut', dates: 'Dates', services: 'Services', total: 'Total' },
    statusLabel: { IN_PROGRESS: 'En cours', PENDING: 'En attente', WALKIN: 'Walk-in', COMPLETED: 'Terminée', CONFIRMED: 'Confirmée', CANCELLED: 'Annulée', REJECTED: 'Refusée', AT_PICKUP: 'Sur place', PENDING_EXTENSION: 'Extension', NO_SHOW: 'Absent', WAITLIST: 'Liste d\'attente' },
    taxiOneway: 'Taxi aller',
    taxiRoundtrip: 'Taxi A+R',
    boardingBadge: 'Pension',
  };
}

// Stub used only for TypeScript inference of the `t` shape passed to <Row>.
export function labelsFor(): ListTranslations {
  throw new Error('typing stub');
}
