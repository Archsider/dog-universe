// ---------------------------------------------------------------------------
// Moteur d'encaissement bancaire — date de valeur (settlement date).
//
// Traduit « le client a payé tel jour, par tel moyen » → « l'argent est
// crédité sur le compte tel jour ». C'est cette date de crédit qui pilote le
// CA sous Sémantique B (cash-basis) : `Payment.paymentDate` = date
// d'encaissement banque. Voir CLAUDE.md § « date de paiement = date
// d'encaissement banque ».
//
// Règle d'encaissement (verrouillée 2026-05-29) :
//   Espèces   → jour même (argent en main)
//   TPE/Carte → +1 jour ouvré (date de valeur)
//   Virement  → +1 jour ouvré (date de valeur)
//   Chèque    → +2 jours ouvrés (encaissement + compensation)
// …en sautant weekends + jours fériés marocains (cf. morocco-calendar.ts).
//
// 100% pur / testable — aucun import Prisma, aucun effet de bord.
// ---------------------------------------------------------------------------

import {
  type Ymd,
  addCalendarDays,
  isBankBusinessDay,
  isPublicHolidayMorocco,
} from './morocco-calendar';

export type { Ymd } from './morocco-calendar';
export {
  addCalendarDays,
  isBankBusinessDay,
  isPublicHolidayMorocco,
  isWeekendMorocco,
} from './morocco-calendar';

/** Moyens de paiement — aligné sur `PAYMENT_METHODS` de record-payment.ts. */
export type SettlementMethod = 'CASH' | 'CARD' | 'CHECK' | 'TRANSFER';

/**
 * Délai d'encaissement en JOURS OUVRÉS par moyen de paiement. Centralisé ici :
 * un seul endroit à toucher si la banque change ses délais de valeur.
 */
export const SETTLEMENT_LAG_BUSINESS_DAYS: Record<SettlementMethod, number> = {
  CASH: 0,     // espèces : encaissé le jour même
  CARD: 1,     // TPE : crédit J+1 ouvré
  TRANSFER: 1, // virement : date de valeur J+1 ouvré
  CHECK: 2,    // chèque : remise + compensation J+2 ouvrés
};

/** Raison pour laquelle un jour a été sauté lors du calcul de la date de valeur. */
export interface SkippedDay {
  ymd: Ymd;
  reason: 'weekend' | 'holiday';
}

export interface SettlementExplanation {
  /** Jour où le client a payé (base du calcul). */
  paidOn: Ymd;
  /** Date de crédit estimée sur le compte bancaire. */
  settlementYmd: Ymd;
  method: SettlementMethod;
  /** Délai appliqué, en jours ouvrés. */
  lagBusinessDays: number;
  /** Jours non-ouvrés sautés entre `paidOn` (exclu) et `settlementYmd`. */
  skipped: SkippedDay[];
}

/**
 * Avance de `n` jours OUVRÉS bancaires à partir de `start` (exclu), en sautant
 * weekends + fériés marocains. `n <= 0` renvoie `start` inchangé.
 */
export function addBankBusinessDays(start: Ymd, n: number): Ymd {
  if (n <= 0) return start;
  let cur = start;
  let added = 0;
  // Garde-fou anti-boucle-infinie (jamais atteint en pratique : il y a au
  // plus 2 jours non-ouvrés consécutifs hors longs ponts fériés).
  let guard = 0;
  while (added < n && guard < 60) {
    cur = addCalendarDays(cur, 1);
    guard++;
    if (isBankBusinessDay(cur)) added++;
  }
  return cur;
}

/**
 * Date de crédit banque estimée pour un paiement effectué le `paidOn` via
 * `method`. Les espèces tombent le jour même (argent en main) ; les autres
 * moyens roulent du nombre de jours ouvrés correspondant.
 */
export function computeSettlementYmd(paidOn: Ymd, method: SettlementMethod): Ymd {
  const lag = SETTLEMENT_LAG_BUSINESS_DAYS[method];
  return addBankBusinessDays(paidOn, lag);
}

/**
 * Variante détaillée : renvoie la date de valeur + la liste des jours
 * non-ouvrés sautés (pour expliquer le calcul à l'opérateur dans l'UI).
 */
export function explainSettlement(
  paidOn: Ymd,
  method: SettlementMethod,
): SettlementExplanation {
  const lag = SETTLEMENT_LAG_BUSINESS_DAYS[method];
  const skipped: SkippedDay[] = [];
  let cur = paidOn;
  let added = 0;
  let guard = 0;
  while (added < lag && guard < 60) {
    cur = addCalendarDays(cur, 1);
    guard++;
    if (isBankBusinessDay(cur)) {
      added++;
    } else {
      skipped.push({
        ymd: cur,
        reason: isPublicHolidayMorocco(cur) ? 'holiday' : 'weekend',
      });
    }
  }
  return {
    paidOn,
    settlementYmd: lag <= 0 ? paidOn : cur,
    method,
    lagBusinessDays: lag,
    skipped,
  };
}

/**
 * Formate une `Ymd` en date longue localisée ("1 juin 2026" / "June 1, 2026").
 * Midi forcé pour neutraliser tout rollover de fuseau lors du `new Date`.
 */
export function formatYmdLong(ymd: Ymd, locale: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : 'en-US',
    { day: 'numeric', month: 'long', year: 'numeric' },
  );
}
