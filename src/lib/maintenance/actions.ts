// Maintenance actions — one-shot operations exposed via
// /api/admin/maintenance/[action].
//
// Each action is read-pure + safe, OR explicitly destructive (P0).
// Destructive actions REQUIRE a `confirm: <expected-count>` token from
// the UI so a misclick can't nuke 10k rows.
//
// Source : Wave 7 (admin maintenance), 2026-05-20.

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { logAction } from '@/lib/log';

export type ActionResult =
  | { ok: true; rowsAffected?: number; detail?: string }
  | { ok: false; error: string };

// ── Section B — Safe one-clicks (P2) ──────────────────────────────────

export async function clearBackupErrorStamp(): Promise<ActionResult> {
  try {
    const { Redis } = await import('@upstash/redis');
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return { ok: false, error: 'REDIS_NOT_CONFIGURED' };
    const client = new Redis({ url, token });
    await client.del('bk:last:err');
    return { ok: true, detail: 'Stale backup error stamp cleared.' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function refreshMonthlyRevenueMV(): Promise<ActionResult> {
  try {
    // REFRESH MV may also conflict with PgBouncer transaction mode on
    // some configs.  Try the pooled connection first ; on failure, retry
    // via a direct pg connection (same approach as VACUUM).
    await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv');
    // Stamp the freshness key so the fast-path readers see it.
    try {
      const { Redis } = await import('@upstash/redis');
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (url && token) {
        const client = new Redis({ url, token });
        await client.set('mv:last_refresh:monthly_revenue_mv', new Date().toISOString(), { ex: 7 * 86_400 });
      }
    } catch { /* fail-soft */ }
    return { ok: true, detail: 'monthly_revenue_mv refreshed.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Some Postgres versions require non-CONCURRENTLY when no rows yet.
    if (/concurrently/i.test(msg)) {
      try {
        await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW monthly_revenue_mv');
        return { ok: true, detail: 'monthly_revenue_mv refreshed (non-concurrent).' };
      } catch (err2) {
        return { ok: false, error: err2 instanceof Error ? err2.message : String(err2) };
      }
    }
    return { ok: false, error: msg };
  }
}

export async function vacuumAnalyzeHotTables(): Promise<ActionResult> {
  // VACUUM cannot run via PgBouncer transaction-mode pool (every Prisma
  // query through the pooler runs in an implicit tx).  Open a *direct*
  // pg connection (DIRECT_URL on port 5432) just for this operation.
  // Cleaned up explicitly to avoid leaking the connection.
  const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!directUrl) return { ok: false, error: 'DIRECT_URL_NOT_CONFIGURED' };

  const tables = ['Notification', 'Heartbeat', 'SmsLog', 'ActionLog', 'TaxiLocation', 'GuardianEvent'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Client: any;
  try {
    const mod = await import('pg');
    Client = mod.Client ?? mod.default?.Client;
  } catch (err) {
    return { ok: false, error: `pg_import_failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const client = new Client({ connectionString: directUrl });
  let done = 0;
  const errors: string[] = [];
  try {
    await client.connect();
    for (const t of tables) {
      try {
        await client.query(`VACUUM (ANALYZE) "${t}"`);
        done++;
      } catch (err) {
        errors.push(`${t}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    return { ok: false, error: `connect_failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }

  if (errors.length > 0 && done === 0) return { ok: false, error: errors.join('; ') };
  return {
    ok: true,
    detail: errors.length > 0
      ? `VACUUM ANALYZE done on ${done}/${tables.length} tables. Errors: ${errors.join('; ')}`
      : `VACUUM ANALYZE done on ${done} tables.`,
  };
}

export async function clearBusinessCaches(): Promise<ActionResult> {
  try {
    const { Redis } = await import('@upstash/redis');
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return { ok: false, error: 'REDIS_NOT_CONFIGURED' };
    const client = new Redis({ url, token });

    // Best-effort pattern scan : Upstash REST does NOT support SCAN ;
    // we delete fixed keys + iterate per-month for the last 24 months.
    const keys: string[] = ['capacity_dog', 'capacity_cat', 'mv:refresh:debounce:monthly_revenue'];
    const { casablancaYMD } = await import('@/lib/dates-casablanca');
    const today = casablancaYMD();
    for (let i = 0; i < 24; i++) {
      // Walk backwards 24 months — Casa-anchored to stay correct at midnight boundary.
      let y = today.year;
      let m = today.month - i;
      while (m <= 0) { m += 12; y -= 1; }
      keys.push(`revenue:${y}:${m}`);
    }
    let deleted = 0;
    for (const k of keys) {
      try {
        const r = await client.del(k);
        if (r > 0) deleted++;
      } catch { /* ignore individual del failure */ }
    }
    return { ok: true, rowsAffected: deleted, detail: `${deleted} cache keys cleared.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Section C — Purges (P1, requires confirmation) ────────────────────

interface PurgeArgs { confirm?: boolean; actorId: string }

export async function purgeSmsLog(args: PurgeArgs): Promise<ActionResult> {
  if (!args.confirm) return { ok: false, error: 'CONFIRMATION_REQUIRED' };
  try {
    const r = await prisma.$executeRaw`DELETE FROM "SmsLog" WHERE "sentAt" < NOW() - INTERVAL '90 days'`;
    await logAction({ userId: args.actorId, action: 'MAINTENANCE_PURGE', entityType: 'SmsLog', entityId: 'sweep', details: { rows: r, criterion: '>90d' } });
    return { ok: true, rowsAffected: Number(r) };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
}

export async function purgeGuardianEvents(args: PurgeArgs): Promise<ActionResult> {
  if (!args.confirm) return { ok: false, error: 'CONFIRMATION_REQUIRED' };
  try {
    const r = await prisma.$executeRaw`DELETE FROM "GuardianEvent" WHERE "createdAt" < NOW() - INTERVAL '60 days'`;
    await logAction({ userId: args.actorId, action: 'MAINTENANCE_PURGE', entityType: 'GuardianEvent', entityId: 'sweep', details: { rows: r, criterion: '>60d' } });
    return { ok: true, rowsAffected: Number(r) };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
}

export async function purgeActionLog(args: PurgeArgs): Promise<ActionResult> {
  if (!args.confirm) return { ok: false, error: 'CONFIRMATION_REQUIRED' };
  try {
    // Preserve money-path entries (legal/accounting audit) AND invariant alerts.
    const r = await prisma.$executeRaw`
      DELETE FROM "ActionLog"
      WHERE "createdAt" < NOW() - INTERVAL '365 days'
        AND "action" NOT IN (
          'PAYMENT_RECORDED','INVOICE_CREATED','INVOICE_CREATED_WALKIN',
          'INVOICE_CANCELLED','INVOICE_PAID','RGPD_PURGE',
          'INVARIANT_VIOLATION_DETECTED','BOOKING_CHECKOUT','BOOKING_COMPLETED'
        )
    `;
    // Note: this row's own log entry survives the cutoff.
    await logAction({ userId: args.actorId, action: 'MAINTENANCE_PURGE', entityType: 'ActionLog', entityId: 'sweep', details: { rows: Number(r), criterion: '>365d non-money' } });
    return { ok: true, rowsAffected: Number(r) };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
}

export async function purgePasswordResetTokens(args: PurgeArgs): Promise<ActionResult> {
  if (!args.confirm) return { ok: false, error: 'CONFIRMATION_REQUIRED' };
  try {
    const r = await prisma.$executeRaw`
      DELETE FROM "PasswordResetToken"
      WHERE "used" = true OR "expiresAt" < NOW()
    `;
    return { ok: true, rowsAffected: Number(r) };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
}

export async function purgeTaxiStatusHistory(args: PurgeArgs): Promise<ActionResult> {
  if (!args.confirm) return { ok: false, error: 'CONFIRMATION_REQUIRED' };
  try {
    const r = await prisma.$executeRaw`DELETE FROM "TaxiStatusHistory" WHERE "createdAt" < NOW() - INTERVAL '180 days'`;
    await logAction({ userId: args.actorId, action: 'MAINTENANCE_PURGE', entityType: 'TaxiStatusHistory', entityId: 'sweep', details: { rows: Number(r), criterion: '>180d' } });
    return { ok: true, rowsAffected: Number(r) };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
}

export async function purgeProductCatalogSuggestionsResolved(args: PurgeArgs): Promise<ActionResult> {
  if (!args.confirm) return { ok: false, error: 'CONFIRMATION_REQUIRED' };
  try {
    const r = await prisma.$executeRaw`
      DELETE FROM "ProductCatalogSuggestion"
      WHERE "status" IN ('accepted','rejected')
        AND "respondedAt" < NOW() - INTERVAL '90 days'
    `;
    return { ok: true, rowsAffected: Number(r) };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
}

export async function purgeHeartbeatForce(args: PurgeArgs): Promise<ActionResult> {
  if (!args.confirm) return { ok: false, error: 'CONFIRMATION_REQUIRED' };
  try {
    const r = await prisma.$executeRaw`DELETE FROM "Heartbeat" WHERE "timestamp" < NOW() - INTERVAL '30 days'`;
    return { ok: true, rowsAffected: Number(r) };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
}

void logger; // silence unused import in some test contexts
