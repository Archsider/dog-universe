/**
 * Helpers purs pour le watchdog GPS taxi (driver + client tracker).
 *
 * Aucun import DOM ni Prisma — module testable unitairement, partagé entre
 * le composant chauffeur (watchPosition / fetch queue) et le tracker client
 * (EventSource SSE / fallback polling).
 *
 * Toutes les fonctions sont pures : entrée → sortie déterministe, pas
 * d'effets de bord, pas d'horloge implicite (le caller passe `now`).
 */

// ── Constantes de seuils ─────────────────────────────────────────────────
// Driver-side : santé du watchPosition.
export const WATCH_STALE_MS = 30_000; // au-delà → état 'stale' (badge jaune)
export const WATCH_LOST_MS = 45_000;  // au-delà → restartWatch + 'lost'

// Client-side : santé du flux SSE.
export const SSE_STALE_MS = 60_000;   // au-delà → 'reconnecting' (badge jaune)
export const SSE_LOST_MS = 90_000;    // au-delà → forceReconnect

// File d'attente offline du chauffeur (positions à pousser).
export const QUEUE_MAX = 100;
export const QUEUE_MAX_AGE_MS = 10 * 60 * 1000; // 10 min — au-delà obsolète

// ── Helpers ──────────────────────────────────────────────────────────────

/** True si le watchPosition est silencieux depuis trop longtemps. */
export function shouldRestartWatch(lastFixAt: number, now: number): boolean {
  return now - lastFixAt > WATCH_LOST_MS;
}

/** True si le flux SSE est silencieux depuis trop longtemps. */
export function shouldRestartSse(lastEventAt: number, now: number): boolean {
  return now - lastEventAt > SSE_LOST_MS;
}

/** Drop les éléments de la queue plus vieux que `maxAgeMs`. */
export function pruneQueue<T extends { ts: number }>(
  items: T[],
  maxAgeMs: number,
  now: number,
): T[] {
  return items.filter((item) => now - item.ts <= maxAgeMs);
}

/** Cap FIFO : garde les `max` derniers éléments (les plus récents). */
export function clampQueue<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return items.slice(items.length - max);
}

/** État de santé GPS chauffeur dérivé de la fraîcheur du dernier fix. */
export function gpsHealthFor(
  lastFixAt: number,
  now: number,
): 'live' | 'stale' | 'lost' {
  const delta = now - lastFixAt;
  if (delta > WATCH_LOST_MS) return 'lost';
  if (delta > WATCH_STALE_MS) return 'stale';
  return 'live';
}

/** État de santé SSE client dérivé de la fraîcheur du dernier event. */
export function sseHealthFor(
  lastEventAt: number,
  now: number,
): 'live' | 'stale' | 'lost' {
  const delta = now - lastEventAt;
  if (delta > SSE_LOST_MS) return 'lost';
  if (delta > SSE_STALE_MS) return 'stale';
  return 'live';
}
