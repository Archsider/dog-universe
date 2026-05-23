/**
 * WhatsApp deep-link helpers (wa.me — no API key required).
 */

/**
 * Converts a phone number to E.164 format (`+CCNNNNNNNNN`).
 * Returns null if the number is empty or cannot be recognised as a valid
 * international number.
 *
 * Rules (in order):
 *   1. Strip spaces, dashes, dots, parentheses.
 *   2. `00...`   → treated as international prefix, replaced by `+`.
 *   3. `+...`    → validated (8–15 digits) and returned unchanged.
 *   4. `06X` / `07X` + 8 digits → Morocco mobile  → `+212` + rest.
 *   5. `05X`     + 8 digits → France             → `+33`  + rest.
 *   6. Anything else (digits only, no leading `+`) → default Morocco `+212`
 *      with a leading `0` stripped if present.
 *
 * The function is permissive about formatting whitespace but strict about
 * the resulting E.164 length (8–15 digits after the `+`, per ITU-T E.164).
 */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // 1. Strip formatting characters.
  let cleaned = phone.replace(/[\s\-.()]/g, '');
  if (!cleaned) return null;

  // 2. `00` international prefix → `+`.
  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  // 3. Already in E.164 form: validate and return.
  if (cleaned.startsWith('+')) {
    return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  }

  // From here on, `cleaned` contains digits only.
  if (!/^\d+$/.test(cleaned)) return null;

  // 4. Moroccan mobile: 06 / 07 + 8 digits.
  if (/^0[67]\d{8}$/.test(cleaned)) {
    return `+212${cleaned.slice(1)}`;
  }

  // 5. French number starting with 05 + 8 digits.
  if (/^05\d{8}$/.test(cleaned)) {
    return `+33${cleaned.slice(1)}`;
  }

  // 6. Default: assume Morocco. Strip a leading `0` if present, then prefix +212.
  const local = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
  const candidate = `+212${local}`;
  return /^\+\d{8,15}$/.test(candidate) ? candidate : null;
}

/**
 * Backwards-compatible alias kept for older imports.
 * Prefer `toE164` in new code.
 */
export const toE164Morocco = toE164;

interface OverdueInvoiceContext {
  clientName: string | null | undefined;
  invoiceNumber: string;
  /** Pre-formatted remaining amount, e.g. `formatMAD(remaining)`. */
  amountLabel: string;
  locale: string;
}

/**
 * Soft, professional WhatsApp reminder for an unpaid / partially-paid invoice.
 * FR/EN parity. Uses the client's first name when available. Pure — the caller
 * formats the amount (via `formatMAD`) so the currency rendering stays consistent.
 */
export function buildOverdueInvoiceMessage(ctx: OverdueInvoiceContext): string {
  const first = (ctx.clientName ?? '').trim().split(/\s+/)[0] || '';
  if (ctx.locale === 'en') {
    const hi = first ? `Hello ${first}` : 'Hello';
    return `${hi}, a friendly reminder about invoice ${ctx.invoiceNumber} — ${ctx.amountLabel} remaining — at Dog Universe. Feel free to reach out with any questions. Thank you!`;
  }
  const bonjour = first ? `Bonjour ${first}` : 'Bonjour';
  return `${bonjour}, petit rappel concernant votre facture ${ctx.invoiceNumber} — reste ${ctx.amountLabel} — chez Dog Universe. N'hésitez pas si vous avez la moindre question. Merci !`;
}

/**
 * Status-aware opening message the admin can send to a client about their
 * booking, in one tap. FR/EN. Pure — `status` is the Booking.status string;
 * unknown statuses fall back to a neutral greeting.
 */
export function buildBookingContactMessage(
  clientName: string | null | undefined,
  status: string,
  locale: string,
): string {
  const first = (clientName ?? '').trim().split(/\s+/)[0] || '';
  const en = locale === 'en';
  const hi = en ? (first ? `Hello ${first}` : 'Hello') : first ? `Bonjour ${first}` : 'Bonjour';
  switch (status) {
    case 'PENDING':
      return en
        ? `${hi}, we've received your booking request at Dog Universe and will confirm it shortly. Any question?`
        : `${hi}, nous avons bien reçu votre demande de réservation chez Dog Universe et la confirmons très vite. Une question ?`;
    case 'CONFIRMED':
      return en
        ? `${hi}, your booking at Dog Universe is confirmed — we can't wait to welcome your companion!`
        : `${hi}, votre réservation chez Dog Universe est confirmée — nous avons hâte d'accueillir votre compagnon !`;
    case 'IN_PROGRESS':
      return en
        ? `${hi}, your companion is in good hands at Dog Universe. Feel free to reach out anytime!`
        : `${hi}, votre compagnon est entre de bonnes mains chez Dog Universe. N'hésitez pas si vous avez une question !`;
    case 'COMPLETED':
      return en
        ? `${hi}, thank you for trusting Dog Universe! We hope to see your companion again soon.`
        : `${hi}, merci de votre confiance chez Dog Universe ! Nous espérons revoir votre compagnon bientôt.`;
    default:
      return en
        ? `${hi}, I'm reaching out from Dog Universe. How can I help?`
        : `${hi}, je vous contacte de la part de Dog Universe. Comment puis-je vous aider ?`;
  }
}

/**
 * Builds a wa.me deep-link for WhatsApp.
 * Returns null if `phone` is null/empty/unrecognised — callers should hide
 * the WhatsApp button entirely in that case.
 *
 * Format: https://wa.me/{E164withoutPlus}?text={encodedMessage}
 */
export function waLink(phone: string | null | undefined, message: string): string | null {
  const e164 = toE164(phone);
  if (!e164) return null;
  const number = e164.replace('+', '');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
