import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// If cached instance is missing models (e.g. after prisma generate), reset it
if (globalForPrisma.prisma && !(globalForPrisma.prisma as unknown as Record<string, unknown>).setting) {
  globalForPrisma.prisma = undefined;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// ── Soft-delete handling ───────────────────────────────────────────────────────
// The $extends Prisma Client Extension was reverted (commit f0...) because it
// crashed Vercel Edge Runtime via the middleware → auth → prisma import chain
// (MIDDLEWARE_INVOCATION_FAILED in production).
//
// Soft-delete is handled explicitly at every Pet/Booking call site:
//   prisma.booking.findFirst({ where: { id, deletedAt: null }, ... })
//   prisma.pet.findMany({ where: { ..., deletedAt: null } })
//
// Keep using this pattern in new code. A future Node-only soft-delete wrapper
// can be added in `src/lib/prismaSoft.ts` (imported only from API routes, never
// from auth.ts or middleware).
