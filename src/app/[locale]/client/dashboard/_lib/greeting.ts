// Daily greeting — contextual line under the client's name.  Depends only
// on the current hour (Casa) and the next upcoming booking, so it stays
// fully server-side renderable.  No external météo API call : we keep the
// page snappy and avoid the rate-limit / privacy concerns.
//
// Source : Wave 5 audit (UX classe mondiale) — make the app feel alive
// rather than algorithmic.  Replaces the static "Bienvenue dans votre
// espace personnel" subtitle.

import { daysUntilCasablanca } from '@/lib/dates-casablanca';

export interface GreetingContext {
  locale: string;
  /** Closest upcoming or in-progress booking (optional). */
  nextBooking?: {
    serviceType: 'BOARDING' | 'PET_TAXI';
    startDate: Date;
    status: string;
    firstPetName?: string | null;
  } | null;
  /** Most recent completed stay to "callback" against. */
  lastCompletedBooking?: {
    endDate: Date | null;
    firstPetName?: string | null;
  } | null;
  /** Override the current time — used in tests. */
  now?: Date;
}

interface Greeting {
  /** Top-line greeting ("Bonsoir" / "Good evening" / "مساء الخير"). */
  salutation: string;
  /** One-line contextual subtitle (FR/EN/AR based on locale). */
  subtitle: string;
}

const CASA_OFFSET_MIN = 60; // Africa/Casablanca = UTC+1 (no DST).

function hourCasa(d: Date): number {
  // Avoid `.getHours()` on a Vercel UTC runtime — compute Casa hour from
  // the UTC value + offset directly.
  const utcMs = d.getTime();
  const casaMs = utcMs + CASA_OFFSET_MIN * 60_000;
  return new Date(casaMs).getUTCHours();
}

export function buildGreeting(ctx: GreetingContext): Greeting {
  const now = ctx.now ?? new Date();
  const h = hourCasa(now);
  const fr = ctx.locale === 'fr';
  const ar = ctx.locale === 'ar';

  let salutation: string;
  if (h < 5)       salutation = fr ? 'Bonne nuit' : ar ? 'تصبح على خير' : 'Good night';
  else if (h < 12) salutation = fr ? 'Bonjour'    : ar ? 'صباح الخير'   : 'Good morning';
  else if (h < 18) salutation = fr ? 'Bon après-midi' : ar ? 'مساء الخير' : 'Good afternoon';
  else             salutation = fr ? 'Bonsoir'    : ar ? 'مساء الخير'   : 'Good evening';

  // Contextual subtitle — priority :
  //   1. Next booking with countdown
  //   2. Mention of last visited pet
  //   3. Generic fallback
  let subtitle: string;

  if (ctx.nextBooking) {
    // Casa-anchored day count — the earlier YYYYMMDD arithmetic broke
    // across month boundaries (Jan 31 → Feb 1 yielded 70 instead of 1).
    const days = Math.max(0, daysUntilCasablanca(ctx.nextBooking.startDate, now));
    const petName = ctx.nextBooking.firstPetName ?? '';

    if (ctx.nextBooking.status === 'IN_PROGRESS') {
      subtitle = fr
        ? petName
          ? `${petName} est entre les meilleures mains 🐾`
          : 'Votre compagnon est entre les meilleures mains 🐾'
        : ar
          ? petName ? `${petName} في أفضل الأيدي 🐾` : 'صديقك في أفضل الأيدي 🐾'
          : petName ? `${petName} is in the best hands 🐾` : 'Your companion is in the best hands 🐾';
    } else if (days === 0) {
      subtitle = fr
        ? petName ? `On vous attend aujourd'hui pour ${petName}` : 'On vous attend aujourd\'hui'
        : ar ? 'نراك اليوم' : petName ? `See you today for ${petName}` : 'See you today';
    } else if (days === 1) {
      subtitle = fr
        ? petName ? `À demain pour ${petName} 🌙` : 'À demain 🌙'
        : ar ? 'إلى اللقاء غداً 🌙' : petName ? `See you tomorrow for ${petName} 🌙` : 'See you tomorrow 🌙';
    } else if (days <= 7) {
      subtitle = fr
        ? `Plus que ${days} jour${days > 1 ? 's' : ''} avant ${petName || 'leur arrivée'}.`
        : ar ? `${days} يوم/أيام للوصول.` : `${days} day${days > 1 ? 's' : ''} until ${petName || 'their arrival'}.`;
    } else {
      subtitle = fr
        ? `Prochaine réservation dans ${days} jours.`
        : ar ? `الحجز القادم خلال ${days} يوماً.` : `Next stay in ${days} days.`;
    }
  } else if (ctx.lastCompletedBooking?.firstPetName) {
    const petName = ctx.lastCompletedBooking.firstPetName;
    subtitle = fr
      ? `${petName} vous manque ? On a hâte de le revoir.`
      : ar ? `هل تشتاق إلى ${petName}؟ نحن متشوقون لرؤيته من جديد.` : `Missing ${petName}? We can't wait to see them again.`;
  } else {
    subtitle = fr
      ? 'Votre espace personnel — pension, fidélité, photos.'
      : ar ? 'مساحتك الشخصية — الإقامة، الولاء، الصور.' : 'Your personal space — stays, loyalty, photos.';
  }

  return { salutation, subtitle };
}
