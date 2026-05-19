// Service layer for Daily Report Card — admin-curated daily updates for
// each pet in IN_PROGRESS boarding.
//
// Workflow :
//   - Cron `daily-report-drafts` (16h Casa) creates DRAFT rows for every
//     IN_PROGRESS pet, idempotent via UNIQUE (petId, date).
//   - Admin browses /admin/daily-reports, fills photos / emojis / note,
//     then clicks Send → email + in-app notification, status flips to SENT.
//   - Admin can Skip a report (no spam) or open a wa.me link to send the
//     same content via WhatsApp manually (no auto-API in V1).

import { casablancaYMD } from './dates-casablanca';

export type DailyEmoji = {
  mood: string | null;
  food: string | null;
  sleep: string | null;
  play: string | null;
};

// Default emoji set offered to admin — keeps the visual language consistent.
// Picked for legibility on common mobile fonts ; admin can pick "no emoji".
export const EMOJI_OPTIONS = {
  mood: ['😊', '🥰', '😎', '😌', '🐶', '🥲', '😴'],
  food: ['🍖', '🥩', '🍗', '🥣', '🍪', '🐾', '😋'],
  sleep: ['😴', '💤', '🌙', '☁️', '🛌', '🥱'],
  play: ['🎾', '🐕‍🦺', '🐩', '🦴', '🏃', '🤸', '🎉'],
} as const;

/** Today's Casa calendar day as 'YYYY-MM-DD'. */
export function todayCasaYmd(): string {
  const { year, month, day } = casablancaYMD(new Date());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Human-readable summary of the 4 emoji selectors — used in WhatsApp / email
// body when a screen reader / textual fallback is desired.
const EMOJI_LABELS_FR: Record<keyof DailyEmoji, string> = {
  mood:  'Humeur',
  food:  'Appétit',
  sleep: 'Sommeil',
  play:  'Jeu',
};

/** Build the WhatsApp message body — text only, no media (manual share). */
export function buildWhatsappMessage(params: {
  clientFirstName: string | null;
  petName: string;
  date: string; // YYYY-MM-DD
  emoji: DailyEmoji;
  note: string | null;
}): string {
  const greeting = params.clientFirstName
    ? `Bonjour ${params.clientFirstName}`
    : 'Bonjour';
  const lines: string[] = [];
  lines.push(`${greeting} 👋`);
  lines.push('');
  lines.push(`Voici les nouvelles de ${params.petName} aujourd'hui :`);
  lines.push('');
  const emojiLine = (Object.keys(EMOJI_LABELS_FR) as (keyof DailyEmoji)[])
    .filter(k => params.emoji[k])
    .map(k => `${EMOJI_LABELS_FR[k]} ${params.emoji[k]}`)
    .join('   ');
  if (emojiLine) lines.push(emojiLine);
  if (params.note && params.note.trim().length > 0) {
    lines.push('');
    lines.push(params.note.trim());
  }
  lines.push('');
  lines.push('— Dog Universe');
  return lines.join('\n');
}

/** Build the wa.me share URL.  Returns null when phone is missing. */
export function buildWhatsappShareUrl(params: {
  clientPhone: string | null;
  message: string;
}): string | null {
  if (!params.clientPhone) return null;
  const digits = params.clientPhone.replace(/[^\d]/g, '');
  if (digits.length < 8) return null;
  let normalized = digits;
  if (digits.startsWith('00')) normalized = digits.slice(2);
  else if (digits.startsWith('0')) normalized = `212${digits.slice(1)}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(params.message)}`;
}

/** Validate the contents of a report just before sending.  Returns error code or null. */
export function validateForSend(input: {
  photoUrls: string[];
  moodEmoji: string | null;
  foodEmoji: string | null;
  sleepEmoji: string | null;
  playEmoji: string | null;
  note: string | null;
}): 'NEEDS_PHOTO_OR_NOTE' | 'NOTE_TOO_LONG' | null {
  const hasPhoto = input.photoUrls.length > 0;
  const hasNote  = !!(input.note && input.note.trim().length > 0);
  const hasEmoji = !!(input.moodEmoji || input.foodEmoji || input.sleepEmoji || input.playEmoji);
  if (!hasPhoto && !hasNote && !hasEmoji) return 'NEEDS_PHOTO_OR_NOTE';
  if (input.note && input.note.length > 280) return 'NOTE_TOO_LONG';
  return null;
}
