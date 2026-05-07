import { PrismaClient } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Read-replica Prisma client (scaffolding — opt-in par caller).
 *
 * Pourquoi ?
 *   - Les hot paths analytics (`/admin/billing`, `/admin/analytics`, dashboard KPIs)
 *     génèrent des requêtes lourdes (groupBy, aggregate sur Invoice/Payment) qui
 *     concurrencent les writes transactionnels (booking confirm, payment record).
 *   - Supabase Pro permet une read replica → on route les lectures analytiques
 *     vers la replica, on garde primary pour les mutations + lectures critiques.
 *
 * Comportement actuel :
 *   - Si `DATABASE_REPLICA_URL` est défini → nouveau client dédié à la replica
 *   - Sinon → fallback sur le `prisma` primary (transparent, aucun changement)
 *
 * Usage (à introduire progressivement) :
 *
 *   import { prismaRead } from '@/lib/prisma-read';
 *
 *   const cashByMonth = await prismaRead.payment.groupBy({
 *     by: ['paymentDate'],
 *     _sum: { amount: true },
 *   });
 *
 * NE JAMAIS utiliser `prismaRead` pour :
 *   - une lecture qui précède un write dans le même handler (lag de réplication)
 *   - une transaction (`$transaction`) — toujours `prisma`
 *   - un check d'unicité avant insert
 *
 * Voir docs/READ_REPLICA.md pour la stratégie complète.
 */

const globalForPrismaRead = globalThis as unknown as {
  prismaRead: PrismaClient | undefined;
};

function createReadClient(): PrismaClient {
  const replicaUrl = process.env.DATABASE_REPLICA_URL;
  if (!replicaUrl) {
    return prisma;
  }
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: { db: { url: replicaUrl } },
  });
}

export const prismaRead: PrismaClient =
  globalForPrismaRead.prismaRead ?? createReadClient();

if (process.env.NODE_ENV !== 'production' && process.env.DATABASE_REPLICA_URL) {
  globalForPrismaRead.prismaRead = prismaRead;
}
