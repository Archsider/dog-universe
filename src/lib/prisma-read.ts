import { PrismaClient } from '@prisma/client';
import { prisma } from './prisma';

const readUrl = process.env.READ_DATABASE_URL;

const globalForPrismaRead = globalThis as unknown as {
  prismaRead: PrismaClient | undefined;
};

/**
 * Read-only Prisma client.
 *
 * Routes vers une read replica si `READ_DATABASE_URL` est définie, sinon
 * fallback transparent sur le client `prisma` write principal (zéro
 * changement de comportement sans config).
 *
 * ## Quand l'utiliser
 *
 * Pour les RSC pages SSR et les endpoints **GET-only** qui exécutent des
 * lectures lourdes (analytics, dashboards, listings non transactionnels).
 *
 * ## Quand NE PAS l'utiliser
 *
 * - Toute mutation ou write doit utiliser `prisma` (write client).
 * - Toute lecture à l'intérieur d'une `$transaction` Serializable doit
 *   utiliser le client `tx` passé par Prisma (jamais `prismaRead`).
 * - Tout read-after-write dans la même requête utilisateur : la replica
 *   peut accuser un lag (typiquement < 100 ms en région proche, jusqu'à
 *   quelques secondes sur charge). Lire depuis la replica juste après un
 *   write peut retourner l'état antérieur. Préférer renvoyer la valeur
 *   déjà en mémoire (cf. exemple dans `docs/READ_REPLICA.md`).
 * - Capacity check, idempotency check, auth/session validation : la
 *   cohérence stricte est requise.
 *
 * ## Fallback transparent
 *
 * Sans `READ_DATABASE_URL` défini (état actuel par défaut), cet export
 * pointe sur la **même instance** que `prisma`. Aucun coût ni risque
 * supplémentaire : retirer la variable d'env permet un rollback
 * instantané sur le client write principal.
 *
 * Voir `docs/READ_REPLICA.md` pour la stratégie de migration et la
 * checklist Supabase Pro.
 */
export const prismaRead: PrismaClient = readUrl
  ? globalForPrismaRead.prismaRead ??
    new PrismaClient({
      datasources: { db: { url: readUrl } },
    })
  : prisma;

if (
  readUrl &&
  process.env.NODE_ENV !== 'production' &&
  !globalForPrismaRead.prismaRead
) {
  globalForPrismaRead.prismaRead = prismaRead;
}
