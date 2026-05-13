// Static label dictionaries for the admin dashboard. Kept at the route
// level (not in a global i18n bundle) — these strings only render here
// and would pollute the shared catalog.

export interface DashboardLabels {
  title: string;
  caMonthly: string;
  animauxHeberges: string;
  pending: string;
  totalClients: string;
  pension: string;
  taxi: string;
  grooming: string;
  croquettes: string;
  loyalClients: string;
  newClients: string;
  recentBookings: string;
  viewAll: string;
  revenueTitle: string;
  thisMth: string;
  top5: string;
  cats: string;
  dogs: string;
  places: string;
  revenue: string;
  pendingInvoices: string;
  noInvoice: string;
  allInvoiced: string;
  noPendingPayments: string;
  viewAllShort: string;
  checkInsToday: string;
  checkOutsToday: string;
  noMovement: string;
}

const LABELS: Record<'fr' | 'en', DashboardLabels> = {
  fr: {
    title: 'Tableau de bord',
    caMonthly: 'CA mensuel · encaissé',
    animauxHeberges: 'Pension actuelle',
    pending: 'En attente',
    totalClients: 'Total clients',
    pension: 'Pension',
    taxi: 'Taxi animalier',
    grooming: 'Toilettage',
    croquettes: 'Croquettes',
    loyalClients: 'Clients fidèles',
    newClients: 'Nouveaux clients',
    recentBookings: 'Réservations récentes',
    viewAll: 'Voir tout',
    revenueTitle: 'CA mensuel — 12 derniers mois',
    thisMth: 'ce mois · facturé',
    top5: 'Top 5 clients',
    cats: 'Chats',
    dogs: 'Chiens',
    places: 'places',
    revenue: 'CA total',
    pendingInvoices: 'Factures en attente',
    noInvoice: 'Réserv. sans facture',
    allInvoiced: 'Tout est facturé',
    noPendingPayments: 'Aucun encaissement en attente',
    viewAllShort: 'Voir tout',
    checkInsToday: "Arrivées aujourd'hui",
    checkOutsToday: "Départs aujourd'hui",
    noMovement: 'Aucun mouvement',
  },
  en: {
    title: 'Dashboard',
    caMonthly: 'Monthly revenue · collected',
    animauxHeberges: 'Current boarders',
    pending: 'Pending',
    totalClients: 'Total clients',
    pension: 'Boarding',
    taxi: 'Pet taxi',
    grooming: 'Grooming',
    croquettes: 'Croquettes',
    loyalClients: 'Loyal clients',
    newClients: 'New clients',
    recentBookings: 'Recent bookings',
    viewAll: 'View all',
    revenueTitle: 'Monthly revenue — last 12 months',
    thisMth: 'this month · billed',
    top5: 'Top 5 clients',
    cats: 'Cats',
    dogs: 'Dogs',
    places: 'spots',
    revenue: 'Total revenue',
    pendingInvoices: 'Pending invoices',
    noInvoice: 'Bookings without invoice',
    allInvoiced: 'All invoiced',
    noPendingPayments: 'No pending payments',
    viewAllShort: 'View all',
    checkInsToday: 'Check-ins today',
    checkOutsToday: 'Check-outs today',
    noMovement: 'No movement',
  },
};

const STATUS_LABELS: Record<'fr' | 'en', Record<string, string>> = {
  fr: {
    PENDING: 'En attente',
    CONFIRMED: 'Confirmé',
    CANCELLED: 'Annulé',
    REJECTED: 'Refusé',
    COMPLETED: 'Terminé',
    IN_PROGRESS: 'En cours',
  },
  en: {
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
    COMPLETED: 'Completed',
    IN_PROGRESS: 'In progress',
  },
};

export function getDashboardLabels(locale: string): DashboardLabels {
  return locale === 'en' ? LABELS.en : LABELS.fr;
}

export function getDashboardStatusLabels(locale: string): Record<string, string> {
  return locale === 'en' ? STATUS_LABELS.en : STATUS_LABELS.fr;
}
