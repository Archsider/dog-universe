// Static label dictionaries for the cockpit dashboard. Kept at the route
// level — these strings only render here and would pollute the shared
// next-intl catalog.

export interface DashboardLabels {
  // Header
  title: string;
  greeting: (firstName: string) => string;
  // Zone 1 — Maintenant
  zoneNow: string;
  pensionNow: string;
  pendingNow: string;
  pendingCta: (n: number) => string;
  pendingClear: string;
  todayTitle: string;
  checkInsLabel: string;
  checkOutsLabel: string;
  petTaxiLabel: string;
  todayQuiet: string;
  todayQuietSub: string;
  // Zone 2 — Cette semaine
  zoneWeek: string;
  capacity7d: string;
  capacityLegendRed: string;
  capacityLegendOrange: string;
  capacityLegendGreen: string;
  arrivalsTitle: string;
  arrivalsCount: (n: number) => string;
  departuresTitle: string;
  departuresCount: (n: number) => string;
  birthdaysTitle: string;
  viewAll: string;
  // Zone 3 — Alertes & rappels
  zoneAlerts: string;
  vaccinesTitle: string;
  vaccinesCount: (n: number) => string;
  longStaysTitle: string;
  longStaysSub: (n: number) => string;
  contactClient: string;
  inactiveTitle: string;
  inactiveSub: (n: number) => string;
  reachOut: string;
  daysSinceShort: (n: number) => string;
  daysInPensionShort: (n: number) => string;
  invariantsTitle: string;
  invariantsCount: (n: number) => string;
  viewInvariants: string;
  // Empty states
  allValidated: string;
  allValidatedSub: string;
  noUpcoming: string;
  // Footer
  fullFinancialAnalysis: string;
  // Misc
  cats: string;
  dogs: string;
  expiresOn: string;
  arrivedOn: string;
  daysInPension: string;
}

const fr: DashboardLabels = {
  title: 'Tableau de bord',
  greeting: (n) => `Bonjour ${n} 👋`,
  zoneNow: 'Maintenant',
  pensionNow: 'Pension actuelle',
  pendingNow: 'À valider maintenant',
  pendingCta: (n) => `Valider ${n} réservation${n > 1 ? 's' : ''} →`,
  pendingClear: 'Tout est validé',
  todayTitle: "Aujourd'hui",
  checkInsLabel: 'Arrivées',
  checkOutsLabel: 'Départs',
  petTaxiLabel: 'Pet Taxi',
  todayQuiet: "Tout est calme aujourd'hui",
  todayQuietSub: 'Aucune arrivée, aucun départ prévu',
  zoneWeek: 'Cette semaine',
  capacity7d: 'Capacité 7 jours',
  capacityLegendRed: '≥ 90 %',
  capacityLegendOrange: '≥ 70 %',
  capacityLegendGreen: '< 70 %',
  arrivalsTitle: 'Arrivées prévues',
  arrivalsCount: (n) => `${n} prochaine${n > 1 ? 's' : ''} (J → J+7)`,
  departuresTitle: 'Départs prévus',
  departuresCount: (n) => `${n} prochain${n > 1 ? 's' : ''} (J → J+7)`,
  birthdaysTitle: 'Anniversaires cette semaine',
  viewAll: 'Voir tout →',
  zoneAlerts: 'Alertes & rappels',
  vaccinesTitle: 'Vaccins à renouveler',
  vaccinesCount: (n) => `${n} expiration${n > 1 ? 's' : ''} dans les 30 jours`,
  longStaysTitle: 'Séjours longue durée',
  longStaysSub: (n) => `${n} séjour${n > 1 ? 's' : ''} IN_PROGRESS > 21 jours`,
  contactClient: 'Contacter le client →',
  inactiveTitle: 'Clients inactifs (6+ mois)',
  inactiveSub: (n) => `${n} client${n > 1 ? 's' : ''} sans interaction depuis 6 mois`,
  reachOut: 'Relancer →',
  daysSinceShort: (n) => `${n} j`,
  daysInPensionShort: (n) => `${n} j`,
  invariantsTitle: 'Anomalies comptables critiques',
  invariantsCount: (n) => `${n} invariant${n > 1 ? 's' : ''} au rouge`,
  viewInvariants: 'Voir détail →',
  allValidated: 'Tout est validé',
  allValidatedSub: 'Aucune demande en attente',
  noUpcoming: 'Aucune réservation à venir',
  fullFinancialAnalysis: "📊 Voir l'analyse financière complète →",
  cats: 'Chats',
  dogs: 'Chiens',
  expiresOn: 'expire',
  arrivedOn: 'arrivée',
  daysInPension: 'jours en pension',
};

const en: DashboardLabels = {
  title: 'Dashboard',
  greeting: (n) => `Hello ${n} 👋`,
  zoneNow: 'Right now',
  pensionNow: 'Current occupancy',
  pendingNow: 'Awaiting validation',
  pendingCta: (n) => `Validate ${n} booking${n > 1 ? 's' : ''} →`,
  pendingClear: 'All validated',
  todayTitle: 'Today',
  checkInsLabel: 'Check-ins',
  checkOutsLabel: 'Check-outs',
  petTaxiLabel: 'Pet Taxi',
  todayQuiet: 'All quiet today',
  todayQuietSub: 'No arrivals, no departures scheduled',
  zoneWeek: 'This week',
  capacity7d: '7-day capacity',
  capacityLegendRed: '≥ 90 %',
  capacityLegendOrange: '≥ 70 %',
  capacityLegendGreen: '< 70 %',
  arrivalsTitle: 'Expected arrivals',
  arrivalsCount: (n) => `${n} upcoming (today → +7)`,
  departuresTitle: 'Expected departures',
  departuresCount: (n) => `${n} upcoming (today → +7)`,
  birthdaysTitle: 'Birthdays this week',
  viewAll: 'View all →',
  zoneAlerts: 'Alerts & reminders',
  vaccinesTitle: 'Vaccines to renew',
  vaccinesCount: (n) => `${n} expiration${n > 1 ? 's' : ''} within 30 days`,
  longStaysTitle: 'Long-running stays',
  longStaysSub: (n) => `${n} IN_PROGRESS stay${n > 1 ? 's' : ''} > 21 days`,
  contactClient: 'Contact client →',
  inactiveTitle: 'Inactive clients (6+ months)',
  inactiveSub: (n) => `${n} client${n > 1 ? 's' : ''} with no interaction for 6 months`,
  reachOut: 'Reach out →',
  daysSinceShort: (n) => `${n} d`,
  daysInPensionShort: (n) => `${n} d`,
  invariantsTitle: 'Critical accounting anomalies',
  invariantsCount: (n) => `${n} invariant${n > 1 ? 's' : ''} in the red`,
  viewInvariants: 'View details →',
  allValidated: 'All validated',
  allValidatedSub: 'No pending requests',
  noUpcoming: 'No upcoming reservations',
  fullFinancialAnalysis: '📊 View full financial analysis →',
  cats: 'Cats',
  dogs: 'Dogs',
  expiresOn: 'expires',
  arrivedOn: 'arrived',
  daysInPension: 'days in pension',
};

export function getDashboardLabels(locale: string): DashboardLabels {
  return locale === 'fr' ? fr : en;
}
