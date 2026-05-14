import { PrismaClient, Prisma } from '@prisma/client';
import { recordSlowQuery, SLOW_QUERY_THRESHOLD_MS } from '@/lib/slow-query-monitor';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// If cached instance is missing models (e.g. after prisma generate), reset it
if (globalForPrisma.prisma &&
    !(globalForPrisma.prisma as unknown as Record<string, unknown>).setting) {
  globalForPrisma.prisma = undefined;
}

// Prisma query event log levels.
//   - dev:  ['query', 'error', 'warn'] → console-friendly query logging
//   - prod: emit query events on the Prisma EventEmitter (silent), so the
//           slow-query monitor can subscribe without spamming Vercel logs.
//           Errors and warnings still log to console.
type Log = Prisma.PrismaClientOptions['log'];
const log: Log = process.env.NODE_ENV === 'development'
  ? ['query', 'error', 'warn']
  : [{ emit: 'event', level: 'query' }, 'error', 'warn'];

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// ── Slow-query monitor (PROD only) ────────────────────────────────────────
// Subscribe once. Each query event fires after Prisma has executed the SQL,
// with the duration in ms. We forward queries above the threshold to the
// Redis-backed monitor that surfaces them on /admin/health.
//
// `$on('query')` requires `log: [{ emit: 'event', level: 'query' }]` above —
// otherwise queries log to stdout (noisy) instead of fanning out to listeners.
if (process.env.NODE_ENV === 'production' && !globalForPrisma.prisma) {
  // Cast: Prisma's $on overload for 'query' is conditional on the log config
  // which TypeScript can't infer from the runtime variable.
  (prisma as unknown as { $on: (e: 'query', cb: (ev: { duration: number; query: string }) => void) => void })
    .$on('query', (event) => {
      if (event.duration >= SLOW_QUERY_THRESHOLD_MS) {
        // Fire-and-forget — never block the request on monitor I/O.
        void recordSlowQuery({
          durationMs: event.duration,
          // Truncate the SQL to 500 chars (most slow queries are joins/aggregates
          // — full text isn't needed to diagnose, and we don't want PII leak risk
          // via parameter values that Prisma sometimes inlines).
          sql: event.query.slice(0, 500),
        });
      }
    });
  // Mark on the global so we don't re-subscribe on hot reload.
  globalForPrisma.prisma = prisma;
}

// ── Soft-delete handling ───────────────────────────────────────────────────
// The $extends Prisma Client Extension was reverted (commit f0...) because it
// crashed Vercel Edge Runtime via the middleware → auth → prisma import chain
// (MIDDLEWARE_INVOCATION_FAILED in production).
//
// Soft-delete is handled explicitly at every Pet/Booking call site via
// `notDeleted({ ... })` from `src/lib/prisma-soft.ts`. See ADR-0001.
