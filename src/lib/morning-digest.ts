// Pure builder for the daily "morning digest" email sent to ADMIN/SUPERADMIN.
//
// Maps the structured day snapshot (arrivals/departures/present/pending),
// occupancy and unpaid totals into the flat string `data` record consumed by
// the `morning_digest` email template. Pure + dependency-light so it's unit
// testable without Prisma / DOM.

export interface MorningDigestArrival {
  name: string;
  time: string | null;
}

export interface MorningDigestInput {
  /** Pre-formatted, locale-aware date label (e.g. "vendredi 23 mai 2026"). */
  dateLabel: string;
  arrivals: MorningDigestArrival[];
  departures: { name: string }[];
  presentCount: number;
  pendingCount: number;
  unpaidCount: number;
  /** Pre-formatted remaining unpaid total (e.g. "3 200 MAD"). */
  unpaidTotalLabel: string;
  dogsIn: number;
  dogsLimit: number;
  catsIn: number;
  catsLimit: number;
  dashboardUrl: string;
  billingUrl: string;
}

/** Flat string record for `getEmailTemplate('morning_digest', data, locale)`. */
export function buildMorningDigestData(input: MorningDigestInput): Record<string, string> {
  const arrivalsText = input.arrivals.length
    ? input.arrivals.map((a) => (a.time ? `${a.name} (${a.time})` : a.name)).join(', ')
    : '—';
  const departuresText = input.departures.length
    ? input.departures.map((d) => d.name).join(', ')
    : '—';

  return {
    dateLabel: input.dateLabel,
    arrivalsCount: String(input.arrivals.length),
    departuresCount: String(input.departures.length),
    presentCount: String(input.presentCount),
    pendingCount: String(input.pendingCount),
    unpaidCount: String(input.unpaidCount),
    unpaidTotal: input.unpaidTotalLabel,
    dogsLine: `${input.dogsIn} / ${input.dogsLimit}`,
    catsLine: `${input.catsIn} / ${input.catsLimit}`,
    arrivalsText,
    departuresText,
    dashboardUrl: input.dashboardUrl,
    billingUrl: input.billingUrl,
  };
}

/**
 * One-line summary (used for logs / future SMS). Locale-aware, plain text.
 */
export function buildMorningDigestSummary(input: MorningDigestInput, locale: string): string {
  if (locale === 'en') {
    return `${input.arrivals.length} arrivals · ${input.departures.length} departures · ${input.presentCount} present · ${input.pendingCount} to validate · ${input.unpaidCount} unpaid`;
  }
  return `${input.arrivals.length} arrivées · ${input.departures.length} départs · ${input.presentCount} présents · ${input.pendingCount} à valider · ${input.unpaidCount} impayées`;
}
