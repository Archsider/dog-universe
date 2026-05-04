/**
 * WhatsApp deep-link helpers (wa.me — no API key required).
 */

/**
 * Converts a Moroccan phone number to E.164 format (+212XXXXXXXXX).
 * Returns null if the number cannot be recognised.
 *
 * Supported inputs:
 *   +212XXXXXXXXX  → unchanged
 *   06XXXXXXXX     → +2126XXXXXXXX
 *   07XXXXXXXX     → +2127XXXXXXXX
 *   05XXXXXXXX     → +2125XXXXXXXX
 *   0X-XX-XX-XX-XX (with dashes/spaces) → stripped then processed
 */
export function toE164Morocco(phone: string): string | null {
  if (!phone) return null;

  // Strip spaces, dashes, dots
  const cleaned = phone.replace(/[\s\-.() ]/g, '');

  // Already E.164 with +212
  if (/^\+212[5-9]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // International format without leading +: 212XXXXXXXXX
  if (/^212[5-9]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Local Moroccan mobile: 06/07/05 + 8 digits
  if (/^0[567]\d{8}$/.test(cleaned)) {
    return `+212${cleaned.slice(1)}`;
  }

  return null;
}

/**
 * Builds a wa.me deep-link for WhatsApp.
 * Returns null if `phone` is null/empty/unrecognised.
 *
 * Format: https://wa.me/{E164withoutPlus}?text={encodedMessage}
 */
export function waLink(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null;
  const e164 = toE164Morocco(phone);
  if (!e164) return null;
  const number = e164.replace('+', '');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
