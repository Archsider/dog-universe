// French number-to-words for Moroccan invoices — "Arrêtée la présente facture
// à la somme de ...". Pure + dependency-free → fully unit-testable.
//
// Follows classic French spelling rules:
//   - 71 = "soixante et onze", 80 = "quatre-vingts", 81 = "quatre-vingt-un",
//     91 = "quatre-vingt-onze", 21 = "vingt et un".
//   - "cent" takes 's' only when it ends the number and is multiplied (deux
//     cents) — not "deux cent un", not plain "cent".
//   - "mille" is invariable (deux mille, never "milles"; never "un mille").
//   - "million" takes 's' (deux millions).

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
];
// Indexed by the tens digit. 70/90 handled specially below; 80 too.
const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', '', 'quatre-vingt', ''];

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  // 70–79 = soixante + (10..19) ; 90–99 = quatre-vingt + (10..19)
  if (t === 7 || t === 9) {
    const base = t === 7 ? 'soixante' : 'quatre-vingt';
    if (t === 7 && u === 1) return 'soixante et onze';
    return `${base}-${UNITS[10 + u]}`;
  }
  const tens = TENS[t];
  if (u === 0) return t === 8 ? 'quatre-vingts' : tens;
  // "et un" for 21/31/41/51/61 — but NOT 81 (quatre-vingt-un).
  if (u === 1 && t !== 8) return `${tens} et un`;
  return `${tens}-${UNITS[u]}`;
}

function below1000(n: number): string {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h > 0) {
    if (h === 1) {
      parts.push('cent');
    } else {
      // deux cents / deux cent un
      parts.push(`${UNITS[h]} cent${r === 0 ? 's' : ''}`);
    }
  }
  if (r > 0) parts.push(below100(r));
  return parts.join(' ');
}

/** Non-negative integer → French words. */
export function integerToFrenchWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  const int = Math.floor(n);
  if (int === 0) return 'zéro';

  const millions = Math.floor(int / 1_000_000);
  const thousands = Math.floor((int % 1_000_000) / 1000);
  const rest = int % 1000;
  const parts: string[] = [];

  if (millions > 0) {
    parts.push(millions === 1 ? 'un million' : `${below1000(millions)} million${millions > 1 ? 's' : ''}`);
  }
  if (thousands > 0) {
    // "mille" invariable, and "mille" not "un mille".
    parts.push(thousands === 1 ? 'mille' : `${below1000(thousands)} mille`);
  }
  if (rest > 0) parts.push(below1000(rest));

  return parts.join(' ');
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Amount in MAD → words, e.g. 1355.20 → "Mille trois cent cinquante-cinq
 * dirhams et vingt centimes". Rounds to the centime. Capitalised (sentence
 * start). Negative amounts are prefixed "moins".
 */
export function montantEnLettresMAD(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  const negative = amount < 0;
  const abs = Math.round(Math.abs(amount) * 100) / 100;
  const dirhams = Math.floor(abs);
  const centimes = Math.round((abs - dirhams) * 100);

  let s = `${integerToFrenchWords(dirhams)} ${dirhams <= 1 ? 'dirham' : 'dirhams'}`;
  if (centimes > 0) {
    s += ` et ${integerToFrenchWords(centimes)} ${centimes <= 1 ? 'centime' : 'centimes'}`;
  }
  if (negative) s = `moins ${s}`;
  return capitalize(s);
}
