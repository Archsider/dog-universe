import { PrismaClient, Prisma } from '@prisma/client';
import { recordSlowQuery, SLOW_QUERY_THRESHOLD_MS } from '@/lib/slow-query-monitor';
import { logger } from '@/lib/logger';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSubscribed: boolean | undefined;
};

// If cached instance is missing models (e.g. after prisma generate), reset it
if (
  globalForPrisma.prisma &&
  !(globalForPrisma.prisma as unknown as Record<string, unknown>).setting
) {
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaSubscribed = undefined;
}

// Prisma log config — canonical "all objects" form. Mixing object entries
// (`{ emit: 'event', level: 'query' }`) with bare strings (`'error'`) in the
// same array used to work in older Prisma versions but breaks on some
// Lambda cold starts (the runtime tries to subscribe to a non-existent
// event emitter for the string entries). The all-objects form is what
// the Prisma docs recommend and what we now use everywhere.
type Log = Prisma.PrismaClientOptions['log'];
const log: Log =
  process.env.NODE_ENV === 'development'
    ? [
        { emit: 'stdout', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ]
    : [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ];

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// ── Slow-query monitor (PROD only) ────────────────────────────────────────
// Subscribe once per Lambda instance. Each query event fires after Prisma
// has executed the SQL, with the duration in ms. Slow queries are forwarded
// to the Redis-backed monitor that surfaces them on /admin/health.
//
// Defensive: wrap in try/catch so a failure here can NEVER crash the
// PrismaClient or break the route. The slow-query monitor is observability
// only — losing it is acceptable, breaking the DB is not.
if (process.env.NODE_ENV === 'production' && !globalForPrisma.prismaSubscribed) {
  try {
    // The `$on('query')` overload is only typed when the log config emits
    // 'query' as an event. TypeScript can't see that from a runtime variable
    // so we narrow via cast.
    type QueryEvent = { duration: number; query: string };
    (prisma as unknown as {
      $on: (e: 'query', cb: (ev: QueryEvent) => void) => void;
    }).$on('query', (event) => {
      if (event.duration >= SLOW_QUERY_THRESHOLD_MS) {
        // Fire-and-forget — never block the request on monitor I/O.
        void recordSlowQuery({
          durationMs: event.duration,
          // Truncate SQL to 500 chars: enough to diagnose joins/aggregates
          // without storing PII via parameter values Prisma sometimes inlines.
          sql: event.query.slice(0, 500),
        });
      }
    });
    globalForPrisma.prismaSubscribed = true;
  } catch (err) {
    // Subscription failed (Prisma version mismatch, malformed log config,
    // anything). Log once and continue — the monitor is OFF but the app
    // keeps working.
    logger.warn('prisma', 'slow-query monitor subscription failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Soft-delete handling ───────────────────────────────────────────────────
// The $extends Prisma Client Extension was reverted (commit f0...) because it
// crashed Vercel Edge Runtime via the middleware → auth → prisma import chain
// (MIDDLEWARE_INVOCATION_FAILED in production).
//
// Soft-delete is handled explicitly at every Pet/Booking call site via
// `notDeleted({ ... })` from `src/lib/prisma-soft.ts`. See ADR-0001.
