import { describe, it, expect } from 'vitest';
import {
  computeUptimePercent,
  countConsecutiveFailures,
  latencySeries,
  latestStatus,
  type HeartbeatRow,
} from '../heartbeat';

function row(secondsAgo: number, status: string, latencyMs = 50): HeartbeatRow {
  return {
    timestamp: new Date(Date.now() - secondsAgo * 1000),
    status,
    latencyMs,
    dbStatus: status === 'down' ? 'down' : 'ok',
    redisStatus: status === 'degraded' ? 'down' : 'ok',
  };
}

describe('computeUptimePercent', () => {
  it('returns null on empty window', () => {
    expect(computeUptimePercent([], new Date(Date.now() - 3600_000))).toBeNull();
  });

  it('computes 100% when all ok', () => {
    const rows = [row(60, 'ok'), row(120, 'ok'), row(180, 'ok')];
    expect(computeUptimePercent(rows, new Date(Date.now() - 3600_000))).toBe(100);
  });

  it('computes 50% with half failures', () => {
    const rows = [row(60, 'ok'), row(120, 'down'), row(180, 'ok'), row(240, 'down')];
    expect(computeUptimePercent(rows, new Date(Date.now() - 3600_000))).toBe(50);
  });

  it('rounds to 2 decimal places', () => {
    const rows = [row(60, 'ok'), row(120, 'ok'), row(180, 'down')];
    expect(computeUptimePercent(rows, new Date(Date.now() - 3600_000))).toBe(66.67);
  });

  it('excludes rows outside the window', () => {
    const rows = [row(60, 'ok'), row(7200, 'down')];
    const oneHourAgo = new Date(Date.now() - 3600_000);
    expect(computeUptimePercent(rows, oneHourAgo)).toBe(100);
  });
});

describe('countConsecutiveFailures', () => {
  it('returns 0 on empty array', () => {
    expect(countConsecutiveFailures([])).toBe(0);
  });

  it('returns 0 when latest is ok', () => {
    expect(countConsecutiveFailures([row(60, 'ok'), row(120, 'down')])).toBe(0);
  });

  it('counts streak from the head (most recent first)', () => {
    expect(
      countConsecutiveFailures([row(60, 'down'), row(120, 'degraded'), row(180, 'down'), row(240, 'ok')]),
    ).toBe(3);
  });

  it('counts entire array if all KO', () => {
    expect(countConsecutiveFailures([row(60, 'down'), row(120, 'down')])).toBe(2);
  });
});

describe('latencySeries', () => {
  it('returns chronological ascending order', () => {
    const rows = [row(60, 'ok', 100), row(180, 'ok', 200), row(120, 'ok', 150)];
    const series = latencySeries(rows, new Date(Date.now() - 3600_000));
    expect(series.map((s) => s.latencyMs)).toEqual([200, 150, 100]);
  });

  it('filters by window', () => {
    const rows = [row(60, 'ok'), row(7200, 'ok')];
    expect(latencySeries(rows, new Date(Date.now() - 3600_000))).toHaveLength(1);
  });
});

describe('latestStatus', () => {
  it('returns ok on empty (avoid crying wolf)', () => {
    expect(latestStatus([])).toBe('ok');
  });

  it('returns the head status', () => {
    expect(latestStatus([row(60, 'down'), row(120, 'ok')])).toBe('down');
    expect(latestStatus([row(60, 'degraded')])).toBe('degraded');
  });
});
