import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// If cached instance is missing models (e.g. after prisma generate), reset it
if (globalForPrisma.prisma && !(globalForPrisma.prisma as unknown as Record<string, unknown>).setting) {
  globalForPrisma.prisma = undefined;
}

// ── Soft-delete extension ──────────────────────────────────────────────────────
// Pet and Booking are the only models with deletedAt. All read operations on
// these models automatically filter deletedAt: null unless the caller already
// passes an explicit deletedAt filter (opt-out via { deletedAt: { not: null } }).
//
// Nested includes pointing to Pet or Booking are also filtered recursively.
//
// ⚠ Transactions: tx.* calls do NOT go through this extension.
// Any query inside $transaction that touches Pet/Booking must still add
// deletedAt: null explicitly.

const SOFT_DELETE_MODELS = new Set(['Pet', 'Booking']);

// Relation names that resolve to a soft-deletable model.
const SOFT_DELETE_RELATIONS = new Set([
  'pet',
  'pets',
  'booking',
  'bookings',
  'extensionForBooking',
]);

// Recursively inject { where: { deletedAt: null } } into include subtrees.
function injectIncludes(include: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(include)) {
    if (!val) { out[key] = val; continue; }
    const cfg: Record<string, unknown> = val === true ? {} : { ...(val as Record<string, unknown>) };
    if (SOFT_DELETE_RELATIONS.has(key)) {
      const w = (cfg.where ?? {}) as Record<string, unknown>;
      if (!('deletedAt' in w)) cfg.where = { ...w, deletedAt: null };
    }
    if (cfg.include) {
      cfg.include = injectIncludes(cfg.include as Record<string, unknown>);
    }
    out[key] = cfg;
  }
  return out;
}

const READ_OPS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy',
]);
// findUnique/findUniqueOrThrow require a unique-constraint where — we cannot add
// an arbitrary field like deletedAt directly. We convert these to
// findFirst/findFirstOrThrow with the extra filter instead.
const UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow']);

const baseClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = baseClient;

// $extends uses Node.js-only internals — skip entirely in Vercel Edge Runtime
// (middleware → auth → prisma import chain). API routes run Node.js and get
// the full extension; Edge only needs session JWT validation, no DB writes.
const isEdgeRuntime = typeof (globalThis as Record<string, unknown>).EdgeRuntime === 'string';

const extendedClient = isEdgeRuntime
  ? baseClient
  : baseClient.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: { model: string; operation: string; args: Record<string, unknown>; query: (a: Record<string, unknown>) => Promise<unknown> }) {
            if (!SOFT_DELETE_MODELS.has(model)) return query(args);

            if (READ_OPS.has(operation)) {
              const w = (args.where ?? {}) as Record<string, unknown>;
              if (!('deletedAt' in w)) {
                args.where = { ...w, deletedAt: null };
              }
              if (args.include) args.include = injectIncludes(args.include as Record<string, unknown>);
              return query(args);
            }

            if (UNIQUE_OPS.has(operation)) {
              // Convert to findFirst so we can attach the extra deletedAt filter.
              // Use baseClient to avoid re-triggering this extension on the new call.
              const newOp = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
              const w = (args.where ?? {}) as Record<string, unknown>;
              if (!('deletedAt' in w)) {
                args.where = { ...w, deletedAt: null };
              }
              if (args.include) args.include = injectIncludes(args.include as Record<string, unknown>);
              if (model === 'Pet') {
                return (baseClient.pet as unknown as Record<string, (a: unknown) => Promise<unknown>>)[newOp](args);
              }
              return (baseClient.booking as unknown as Record<string, (a: unknown) => Promise<unknown>>)[newOp](args);
            }

            return query(args);
          },
        },
      },
    });

// Cast back to PrismaClient so existing code that types parameters as
// PrismaClient or TransactionClient remains compatible (the extension only
// adds transparent runtime behaviour — no API signature changes).
export const prisma = extendedClient as unknown as PrismaClient;
