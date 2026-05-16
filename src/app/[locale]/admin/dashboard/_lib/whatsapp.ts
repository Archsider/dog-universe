// WhatsApp deep links for the dashboard "Contacter / Relancer" CTAs.
//
// Format: `https://wa.me/<phone>?text=<urlencoded>`
// - `<phone>` must be digits only, no +, no spaces. E.164 international
//   format. We strip everything non-digit from the raw input. Empty or
//   bogus phones return `null` so the UI can hide the CTA gracefully.
// - The pre-filled message is a soft, action-oriented French nudge. EN
//   variant kept lockstep for locale parity.
//
// Pure helpers — testable without DOM / DB.

/**
 * Strips any non-digit from a phone string. Returns null if the result
 * is too short to be a real number (we keep ≥ 8 digits ; the Moroccan
 * canonical form is 9 digits after the country code).
 */
export function normalizePhoneForWa(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, '');
  if (digits.length < 8) return null;
  return digits;
}

interface LongStayContext {
  petName: string;
  daysInPension: number;
  locale: 'fr' | 'en';
}

export function buildLongStayMessage(ctx: LongStayContext): string {
  if (ctx.locale === 'en') {
    return `Hello, your ${ctx.petName} has been with us for ${ctx.daysInPension} days. Everything is going well — just checking in!`;
  }
  return `Bonjour, votre ${ctx.petName} est en pension chez nous depuis ${ctx.daysInPension} jours. Tout va bien — on prend des nouvelles !`;
}

interface InactiveClientContext {
  clientFirstName: string;
  lastPetName: string | null;
  locale: 'fr' | 'en';
}

export function buildInactiveClientMessage(ctx: InactiveClientContext): string {
  if (ctx.locale === 'en') {
    if (ctx.lastPetName) {
      return `Hello ${ctx.clientFirstName}, we miss you at Dog Universe! How is ${ctx.lastPetName} doing?`;
    }
    return `Hello ${ctx.clientFirstName}, we miss you at Dog Universe! Everything OK on your side?`;
  }
  if (ctx.lastPetName) {
    return `Bonjour ${ctx.clientFirstName}, on pense à vous chez Dog Universe. Comment va ${ctx.lastPetName} ?`;
  }
  return `Bonjour ${ctx.clientFirstName}, on pense à vous chez Dog Universe. Tout va bien de votre côté ?`;
}

/**
 * Build a wa.me URL or return null if the phone is unusable. The caller
 * renders an anchor when non-null, plain text otherwise.
 */
export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const digits = normalizePhoneForWa(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Extracts a usable first name from a "Name Surname" field. Falls back
 * to the full string if it's a single word, or 'client' if blank.
 */
export function firstNameOf(fullName: string | null | undefined): string {
  if (!fullName) return 'client';
  const trimmed = fullName.trim();
  if (trimmed.length === 0) return 'client';
  return trimmed.split(/\s+/)[0];
}
