// Invalidation des clés `availability:{species}:{month}` (Redis, TTL 5 min) après
// toute mutation de booking qui peut changer l'occupancy : création, changement
// de statut vers PENDING/CONFIRMED/IN_PROGRESS (ou hors de cet ensemble),
// changement de dates, cancel, etc.
//
// Fail-open : toute erreur Redis est avalée (cacheDel le fait déjà).
// On ne connaît pas l'espèce (DOG/CAT) à coût raisonnable au moment de
// l'invalidation, donc on supprime les deux clés pour chaque mois couvert
// par [startDate, endDate || startDate].
import { cacheDel } from '@/lib/cache';

function monthKey(d: Date): string {
  // YYYY-MM, en UTC (les clés sont construites côté GET /api/availability avec
  // les mêmes composantes — month vient d'un input querystring YYYY-MM, sans TZ).
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function monthsCovered(start: Date, end: Date): string[] {
  const months = new Set<string>();
  // Itère mois par mois entre start et end inclus.
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  // Garde-fou pour éviter une boucle infinie en cas d'entrée corrompue.
  let safety = 240; // 20 ans max
  while (cursor.getTime() <= stop.getTime() && safety-- > 0) {
    months.add(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return [...months];
}

/**
 * Invalidate `availability:DOG:{month}` and `availability:CAT:{month}` for
 * every month covered by [startDate, endDate]. Best-effort, fail-open.
 */
export async function invalidateAvailabilityCache(
  startDate: Date,
  endDate: Date | null,
): Promise<void> {
  try {
    if (!startDate || Number.isNaN(startDate.getTime())) return;
    const end = endDate && !Number.isNaN(endDate.getTime()) ? endDate : startDate;
    // Si endDate < startDate (mauvaise saisie), on prend juste startDate.
    const lo = startDate;
    const hi = end.getTime() < startDate.getTime() ? startDate : end;

    const months = monthsCovered(lo, hi);
    await Promise.all(
      months.flatMap((m) => [
        cacheDel(`availability:DOG:${m}`),
        cacheDel(`availability:CAT:${m}`),
      ]),
    );
  } catch {
    // Fail-open : jamais bloquer une mutation booking à cause de l'invalidation cache.
  }
}
