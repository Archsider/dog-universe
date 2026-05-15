// Cron freshness watchdog — détecte les crons qui ne fire JAMAIS après
// leur ajout dans `vercel.json`. Cas réel (2026-05-15) : `purge-anonymized`
// ajouté à la config Vercel, mais le déploiement de l'ajout n'avait pas
// re-synchronisé la liste des schedules côté Vercel scheduler. La cron
// affichait "JAMAIS" sur `/admin/health` sans signal actif côté Mehdi.
//
// Politique :
//   1. Chaque tick heartbeat (*/5min) inspecte les crons de `CRON_NAMES`.
//   2. Si un cron a `lastRun === null` ET aucune ancre `cron:first-seen:<name>`
//      → on stamp l'ancre maintenant (Redis, TTL 90j).
//   3. Si l'ancre existe depuis ≥ `STALENESS_THRESHOLD_HOURS` (48h par
//      défaut, > 48h pour absorber les crons mensuels qui mettent ~30j
//      avant leur 1er run sans pour autant être cassés à l'ajout)
//      → SMS SUPERADMIN, dédup 24h via `cron:first-seen-alert:<name>`.
//   4. Si `lastRun !== null` → on clear l'ancre + dedup (cron OK, on
//      arrête de surveiller).
//
// **Limite connue** : les crons MENSUELS (purge-anonymized, schedule
// `0 2 1 * *`) déclencheront naturellement un faux positif à leur ajout
// (>48h avant le prochain 1er du mois). Le seuil de 48h est calibré pour
// les daily/hourly. Pour les monthly, l'opérateur sait que c'est attendu
// et déclenche manuellement via `/api/admin/cron-trigger/<name>` pour
// stamp markCronRun (= preuve que le code marche, à défaut de preuve que
// Vercel scheduler fire bien). Voir `docs/CRON_RECOVERY.md` pour le
// runbook complet.
//
// Fail-open partout (Redis down → no-op, jamais bloquer le heartbeat).

import { cacheGet, cacheSet, cacheDel, tryAcquireFlag } from '@/lib/cache';
import { CRON_NAMES, getCronLastRun } from '@/lib/observability';
import { logger } from '@/lib/logger';

export const STALENESS_THRESHOLD_HOURS = 48;
const ANCHOR_TTL_SECONDS = 90 * 24 * 3600; // 90j, aligned with cron:last_run TTL
const ALERT_DEDUP_TTL_SECONDS = 24 * 3600; // 1 SMS / cron / 24h max

export interface CronFreshnessRow {
  name: string;
  /** ISO timestamp of the last successful run, or null. */
  lastRun: string | null;
  /** ISO timestamp when the "never seen" anchor was first stamped. */
  firstSeen: string | null;
  /** True if we just stamped a fresh anchor this tick. */
  anchorStampedNow: boolean;
  /** True if this row crossed STALENESS_THRESHOLD_HOURS this tick AND
   *  the dedup flag let it through (= SMS would fire for this row). */
  stale: boolean;
}

function hoursSince(iso: string, now: Date): number {
  const ms = now.getTime() - new Date(iso).getTime();
  return ms / 3_600_000;
}

/**
 * Inspect every cron in `CRON_NAMES` and classify it. Pure-ish: reads
 * Redis (lastRun + anchor) + writes Redis (stamp anchor on first observation,
 * clear anchor when cron starts running, acquire dedup flag for SMS). Does
 * NOT send SMS itself — the caller decides whether to broadcast based on
 * the `stale` field.
 *
 * Caller pattern :
 *   const rows = await classifyCronFreshness();
 *   const stale = rows.filter(r => r.stale);
 *   if (stale.length > 0) await broadcastSmsToSuperadmins(...);
 */
export async function classifyCronFreshness(
  now: Date = new Date(),
): Promise<CronFreshnessRow[]> {
  const out: CronFreshnessRow[] = [];

  for (const name of CRON_NAMES) {
    const lastRun = await getCronLastRun(name);
    const anchorKey = `cron:first-seen:${name}`;

    if (lastRun !== null) {
      // Cron a tourné au moins une fois — pas de surveillance nécessaire.
      // Clear de l'ancre + du dedup au cas où on les avait stamps lors
      // d'un cycle précédent (ex: cron qui a fini par se réveiller).
      try {
        await cacheDel(anchorKey);
      } catch {
        /* fail-open */
      }
      out.push({
        name,
        lastRun,
        firstSeen: null,
        anchorStampedNow: false,
        stale: false,
      });
      continue;
    }

    // lastRun === null. Get-or-create l'ancre.
    let firstSeen = await cacheGet<string>(anchorKey);
    let stamped = false;
    if (!firstSeen) {
      firstSeen = now.toISOString();
      try {
        await cacheSet(anchorKey, firstSeen, ANCHOR_TTL_SECONDS);
        stamped = true;
      } catch (err) {
        logger.error('cron-freshness', 'anchor stamp failed', {
          name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let stale = false;
    if (firstSeen && hoursSince(firstSeen, now) >= STALENESS_THRESHOLD_HOURS) {
      // Au-delà du seuil. Réserver le drapeau de dédup pour empêcher
      // une rafale de SMS (heartbeat tourne toutes les 5 min ⇒ sans
      // dédup on enverrait 288 SMS/jour par cron stale).
      const claimed = await tryAcquireFlag(
        `cron:first-seen-alert:${name}`,
        ALERT_DEDUP_TTL_SECONDS,
      );
      if (claimed) {
        stale = true;
      }
    }

    out.push({
      name,
      lastRun: null,
      firstSeen,
      anchorStampedNow: stamped,
      stale,
    });
  }

  return out;
}
