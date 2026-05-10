/**
 * Heartbeat / uptime helpers.
 *
 * Pure functions over arrays of {@link HeartbeatRow} so they're trivially
 * unit-testable. The cron and the /status page do their own DB queries and
 * pass the result here.
 */

export type HeartbeatStatus = 'ok' | 'degraded' | 'down';

export interface HeartbeatRow {
  timestamp: Date;
  status: string;
  latencyMs: number;
  dbStatus: string;
  redisStatus: string;
}

/**
 * Percentage of heartbeats whose status === 'ok' inside the given window.
 * Returns null if no heartbeats fall in the window (avoid 0% false alarm
 * when the cron just hasn't run yet).
 */
export function computeUptimePercent(
  rows: ReadonlyArray<HeartbeatRow>,
  windowStart: Date,
  windowEnd: Date = new Date(),
): number | null {
  const inWindow = rows.filter(
    (r) => r.timestamp >= windowStart && r.timestamp <= windowEnd,
  );
  if (inWindow.length === 0) return null;
  const okCount = inWindow.filter((r) => r.status === 'ok').length;
  return Math.round((okCount / inWindow.length) * 10000) / 100; // 2 dp
}

/**
 * Returns the count of consecutive non-ok heartbeats at the tail (most
 * recent first). `rows` must be sorted DESC by timestamp.
 */
export function countConsecutiveFailures(rows: ReadonlyArray<HeartbeatRow>): number {
  let count = 0;
  for (const r of rows) {
    if (r.status === 'ok') break;
    count++;
  }
  return count;
}

/**
 * Aggregate latency points for a sparkline / chart. Returns the rows in
 * chronological (ascending) order — easier to map to SVG x positions.
 */
export function latencySeries(
  rows: ReadonlyArray<HeartbeatRow>,
  windowStart: Date,
  windowEnd: Date = new Date(),
): Array<{ t: Date; latencyMs: number; status: string }> {
  return rows
    .filter((r) => r.timestamp >= windowStart && r.timestamp <= windowEnd)
    .slice()
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((r) => ({ t: r.timestamp, latencyMs: r.latencyMs, status: r.status }));
}

/**
 * Latest known status, or 'ok' if no heartbeats yet (don't cry wolf on
 * an empty table — page will show "no data" instead).
 */
export function latestStatus(rows: ReadonlyArray<HeartbeatRow>): HeartbeatStatus {
  const latest = rows[0];
  if (!latest) return 'ok';
  if (latest.status === 'down') return 'down';
  if (latest.status === 'degraded') return 'degraded';
  return 'ok';
}
