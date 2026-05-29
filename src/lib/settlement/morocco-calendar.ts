// ---------------------------------------------------------------------------
// Calendrier bancaire marocain — jours ouvrés + jours fériés.
//
// Sous cash-basis (Sémantique B), le CA tombe dans le mois Casa de la date
// d'ENCAISSEMENT bancaire (`Payment.paymentDate`), pas de la date où le client
// a payé. Or l'argent d'un TPE / virement / chèque n'arrive sur le compte
// qu'après N jours OUVRÉS — donc en sautant les weekends ET les jours fériés
// marocains. Ce module est l'unique source de vérité pour « quel jour la
// banque est-elle ouverte ».
//
// ⚠️ DATES ISLAMIQUES (Aïd, Moharram, Mawlid) : basées sur l'observation
// lunaire — elles glissent d'environ 11 jours par an et la date exacte n'est
// confirmée qu'à l'approche. Les valeurs ci-dessous sont les meilleures
// estimations officielles connues, À RÉVISER CHAQUE ANNÉE. Un décalage de
// ±1 jour n'est jamais fatal : l'auto-date n'est qu'une SUGGESTION dans l'UI,
// l'opérateur peut toujours corriger la date d'encaissement à la main.
//
// Toute l'arithmétique est faite en UTC sur des chaînes `YYYY-MM-DD` (date
// pure, sans heure) — donc aucun drift de fuseau horaire, et aucun appel aux
// getters locaux `getMonth/getDate/getDay` interdits par la règle ESLint Casa.
// ---------------------------------------------------------------------------

/** Date pure au format `YYYY-MM-DD` (calendrier, sans heure ni fuseau). */
export type Ymd = string;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Jours fériés FIXES (grégoriens, récurrents chaque année), au format `MM-DD`.
 * Source : jours fériés payés officiels du Maroc.
 */
const FIXED_HOLIDAYS_MMDD: ReadonlySet<string> = new Set([
  '01-01', // Nouvel An
  '01-11', // Manifeste de l'Indépendance
  '01-14', // Nouvel An Amazigh (Yennayer)
  '05-01', // Fête du Travail
  '07-30', // Fête du Trône
  '08-14', // Allégeance Oued Eddahab
  '08-20', // Révolution du Roi et du Peuple
  '08-21', // Fête de la Jeunesse
  '11-06', // Marche Verte
  '11-18', // Fête de l'Indépendance
]);

/**
 * Jours fériés VARIABLES (islamiques) au format `YYYY-MM-DD`.
 * À RÉVISER ANNUELLEMENT (cf. avertissement en tête de fichier).
 */
const VARIABLE_HOLIDAYS: ReadonlySet<string> = new Set([
  // ── 2025 ──
  '2025-03-31', '2025-04-01', // Aïd al-Fitr 1446
  '2025-06-07', '2025-06-08', // Aïd al-Adha 1446
  '2025-06-26',               // 1er Moharram 1447
  '2025-09-04', '2025-09-05', // Aïd al-Mawlid 1447
  // ── 2026 ──
  '2026-03-20', '2026-03-21', // Aïd al-Fitr 1447
  '2026-05-27', '2026-05-28', // Aïd al-Adha 1447  ← pont de fin mai 2026
  '2026-06-16',               // 1er Moharram 1448
  '2026-08-24', '2026-08-25', // Aïd al-Mawlid 1448
  // ── 2027 ──
  '2027-03-10', '2027-03-11', // Aïd al-Fitr 1448
  '2027-05-17', '2027-05-18', // Aïd al-Adha 1448
  '2027-06-06',               // 1er Moharram 1449
  '2027-08-14', '2027-08-15', // Aïd al-Mawlid 1449
]);

function assertYmd(ymd: string): void {
  if (!YMD_RE.test(ymd)) {
    throw new Error(`Invalid Ymd (expected YYYY-MM-DD): ${ymd}`);
  }
}

/** `YYYY-MM-DD` → Date à minuit UTC (jamais lue avec les getters locaux). */
function toUtc(ymd: Ymd): Date {
  assertYmd(ymd);
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Date UTC → `YYYY-MM-DD` (lecture en UTC uniquement). */
function fromUtc(date: Date): Ymd {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Avance (ou recule, n<0) de `n` jours calendaires. Pur, TZ-safe. */
export function addCalendarDays(ymd: Ymd, n: number): Ymd {
  const dt = toUtc(ymd);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

/** Jour de la semaine en UTC : 0 = dimanche … 6 = samedi. */
export function weekdayUtc(ymd: Ymd): number {
  return toUtc(ymd).getUTCDay();
}

/** Weekend marocain = samedi + dimanche (banques fermées). */
export function isWeekendMorocco(ymd: Ymd): boolean {
  const wd = weekdayUtc(ymd);
  return wd === 0 || wd === 6;
}

/** Jour férié officiel marocain (fixe OU islamique). */
export function isPublicHolidayMorocco(ymd: Ymd): boolean {
  assertYmd(ymd);
  return FIXED_HOLIDAYS_MMDD.has(ymd.slice(5)) || VARIABLE_HOLIDAYS.has(ymd);
}

/** Jour ouvré bancaire = ni weekend, ni férié. */
export function isBankBusinessDay(ymd: Ymd): boolean {
  return !isWeekendMorocco(ymd) && !isPublicHolidayMorocco(ymd);
}
