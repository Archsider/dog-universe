// DB diagnostics — read-only Postgres + Prisma stats for the
// /admin/maintenance dashboard.
//
// All queries are cap-safe (LIMIT 20-30) and execute against the metadata
// catalogs (pg_stat_user_*, pg_class).  Safe to hit on every load.
//
// Source : Wave 7 (admin maintenance), 2026-05-20.

import { prisma } from '@/lib/prisma';

export interface TableSize {
  tableName: string;
  totalSize: string;
  totalBytes: number;
  dataSize: string;
  indexesSize: string;
}

export interface TableRowCount {
  tableName: string;
  total: number;
  active: number;
}

export interface SoftDeletedAge {
  tableName: string;
  lt30d: number;
  d30_180: number;
  gt180d: number;
  total: number;
}

export interface UnusedIndex {
  tableName: string;
  indexName: string;
  indexSize: string;
  indexBytes: number;
}

export interface DeadTuples {
  tableName: string;
  liveRows: number;
  deadRows: number;
  deadPct: number;
  lastVacuum: string | null;
}

export interface PoolStats {
  state: string;
  connections: number;
  stale5min: number;
  oldestSeconds: number;
}

export interface MaintenanceDiagnostics {
  tableSizes: TableSize[];
  tableRowCounts: TableRowCount[];
  softDeletedAge: SoftDeletedAge[];
  unusedIndexes: UnusedIndex[];
  deadTuples: DeadTuples[];
  poolStats: PoolStats[];
  mvFreshness: {
    rowEstimate: number;
    size: string;
    lastRefreshIso: string | null;
  } | null;
}

export async function loadMaintenanceDiagnostics(): Promise<MaintenanceDiagnostics> {
  const [
    tableSizes,
    rowCountsRaw,
    softAge,
    unusedIdx,
    dead,
    pool,
    mv,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{
      table_name: string; total_size: string; total_bytes: bigint;
      data_size: string; indexes_size: string;
    }>>`
      SELECT
        c.relname AS table_name,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
        pg_total_relation_size(c.oid) AS total_bytes,
        pg_size_pretty(pg_relation_size(c.oid)) AS data_size,
        pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 20
    `.catch(() => []),

    prisma.$queryRaw<Array<{ table_name: string; total: bigint; active: bigint }>>`
      SELECT 'User' AS table_name, COUNT(*) AS total, COUNT(*) FILTER (WHERE "deletedAt" IS NULL) AS active FROM "User"
      UNION ALL SELECT 'Pet', COUNT(*), COUNT(*) FILTER (WHERE "deletedAt" IS NULL) FROM "Pet"
      UNION ALL SELECT 'Booking', COUNT(*), COUNT(*) FILTER (WHERE "deletedAt" IS NULL) FROM "Booking"
      UNION ALL SELECT 'Invoice', COUNT(*), COUNT(*) FILTER (WHERE status != 'CANCELLED') FROM "Invoice"
      UNION ALL SELECT 'Payment', COUNT(*), COUNT(*) FROM "Payment"
      UNION ALL SELECT 'Notification', COUNT(*), COUNT(*) FILTER (WHERE "deletedAt" IS NULL) FROM "Notification"
      UNION ALL SELECT 'ActionLog', COUNT(*), COUNT(*) FROM "ActionLog"
      UNION ALL SELECT 'Heartbeat', COUNT(*), COUNT(*) FROM "Heartbeat"
      UNION ALL SELECT 'SmsLog', COUNT(*), COUNT(*) FROM "SmsLog"
      UNION ALL SELECT 'StayPhoto', COUNT(*), COUNT(*) FROM "StayPhoto"
      ORDER BY total DESC
    `.catch(() => []),

    prisma.$queryRaw<Array<{
      t: string; lt_30d: bigint; d30_180: bigint; gt_180d: bigint; total: bigint;
    }>>`
      WITH b AS (
        SELECT 'User' AS t, "deletedAt" FROM "User" WHERE "deletedAt" IS NOT NULL
        UNION ALL SELECT 'Pet', "deletedAt" FROM "Pet" WHERE "deletedAt" IS NOT NULL
        UNION ALL SELECT 'Booking', "deletedAt" FROM "Booking" WHERE "deletedAt" IS NOT NULL
      )
      SELECT
        t,
        COUNT(*) FILTER (WHERE "deletedAt" > NOW() - INTERVAL '30 days') AS lt_30d,
        COUNT(*) FILTER (WHERE "deletedAt" BETWEEN NOW() - INTERVAL '180 days' AND NOW() - INTERVAL '30 days') AS d30_180,
        COUNT(*) FILTER (WHERE "deletedAt" < NOW() - INTERVAL '180 days') AS gt_180d,
        COUNT(*) AS total
      FROM b GROUP BY t ORDER BY t
    `.catch(() => []),

    prisma.$queryRaw<Array<{
      table_name: string; index_name: string; index_size: string; index_bytes: bigint;
    }>>`
      SELECT
        s.relname AS table_name, s.indexrelname AS index_name,
        pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
        pg_relation_size(s.indexrelid) AS index_bytes
      FROM pg_stat_user_indexes s
      JOIN pg_index i ON i.indexrelid = s.indexrelid
      WHERE s.schemaname = 'public' AND s.idx_scan = 0
        AND NOT i.indisunique AND NOT i.indisprimary
      ORDER BY pg_relation_size(s.indexrelid) DESC
      LIMIT 20
    `.catch(() => []),

    prisma.$queryRaw<Array<{
      relname: string; n_live_tup: bigint; n_dead_tup: bigint;
      dead_pct: string; last_vacuum: Date | null; last_autovacuum: Date | null;
    }>>`
      SELECT
        relname, n_live_tup, n_dead_tup,
        CASE WHEN n_live_tup > 0 THEN ROUND(100.0 * n_dead_tup / n_live_tup, 1)::text ELSE '0' END AS dead_pct,
        last_vacuum, last_autovacuum
      FROM pg_stat_user_tables
      WHERE schemaname = 'public' AND n_dead_tup > 100
      ORDER BY n_dead_tup DESC LIMIT 15
    `.catch(() => []),

    prisma.$queryRaw<Array<{ state: string; connections: bigint; stale_5min: bigint; oldest_seconds: number | null }>>`
      SELECT
        COALESCE(state, 'unknown') AS state,
        COUNT(*) AS connections,
        COUNT(*) FILTER (WHERE state_change < NOW() - INTERVAL '5 minutes') AS stale_5min,
        MAX(EXTRACT(EPOCH FROM (NOW() - state_change)))::int AS oldest_seconds
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid != pg_backend_pid()
      GROUP BY state ORDER BY connections DESC
    `.catch(() => []),

    prisma.$queryRaw<Array<{ row_estimate: bigint; size: string }>>`
      SELECT c.reltuples::bigint AS row_estimate,
             pg_size_pretty(pg_total_relation_size(c.oid)) AS size
      FROM pg_class c
      WHERE c.relkind = 'm' AND c.relname = 'monthly_revenue_mv'
    `.catch(() => []),
  ]);

  // Read MV last refresh from Redis (canonical source).
  let mvLastRefreshIso: string | null = null;
  try {
    const { Redis } = await import('@upstash/redis');
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      const client = new Redis({ url, token });
      const stamp = await client.get('mv:last_refresh:monthly_revenue_mv');
      if (stamp) mvLastRefreshIso = String(stamp);
    }
  } catch { /* fail-soft */ }

  return {
    tableSizes: tableSizes.map((t) => ({
      tableName: t.table_name,
      totalSize: t.total_size,
      totalBytes: Number(t.total_bytes),
      dataSize: t.data_size,
      indexesSize: t.indexes_size,
    })),
    tableRowCounts: rowCountsRaw.map((r) => ({
      tableName: r.table_name,
      total: Number(r.total),
      active: Number(r.active),
    })),
    softDeletedAge: softAge.map((s) => ({
      tableName: s.t,
      lt30d: Number(s.lt_30d),
      d30_180: Number(s.d30_180),
      gt180d: Number(s.gt_180d),
      total: Number(s.total),
    })),
    unusedIndexes: unusedIdx.map((i) => ({
      tableName: i.table_name,
      indexName: i.index_name,
      indexSize: i.index_size,
      indexBytes: Number(i.index_bytes),
    })),
    deadTuples: dead.map((d) => ({
      tableName: d.relname,
      liveRows: Number(d.n_live_tup),
      deadRows: Number(d.n_dead_tup),
      deadPct: parseFloat(d.dead_pct),
      lastVacuum: (d.last_vacuum ?? d.last_autovacuum)?.toISOString() ?? null,
    })),
    poolStats: pool.map((p) => ({
      state: p.state,
      connections: Number(p.connections),
      stale5min: Number(p.stale_5min),
      oldestSeconds: Number(p.oldest_seconds ?? 0),
    })),
    mvFreshness: mv.length > 0 ? {
      rowEstimate: Number(mv[0].row_estimate),
      size: mv[0].size,
      lastRefreshIso: mvLastRefreshIso,
    } : null,
  };
}
