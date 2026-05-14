import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

const mockPrisma = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
}));

const mockSendSmsNow = vi.hoisted(() => vi.fn());

const mockTryAcquireFlag = vi.hoisted(() => vi.fn());

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function () { return mockRedis; }),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/notify-now', () => ({ sendSmsNow: mockSendSmsNow }));
vi.mock('@/lib/cache', () => ({ tryAcquireFlag: mockTryAcquireFlag }));

process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

import {
  markBackupAttempt,
  getLastBackupSuccess,
  getLastBackupError,
  getBackupFreshness,
  notifyBackupFailure,
  notifyBackupStale,
  BACKUP_STALE_THRESHOLD_HOURS,
} from '../backup-health';

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockTryAcquireFlag.mockResolvedValue(true);
});

describe('markBackupAttempt — success path', () => {
  it('writes bk:last:ok with key + bytes and a 90-day TTL', async () => {
    await markBackupAttempt({ ok: true, key: 'backups/2026-05-13.json.gz', bytes: 1234 });
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    const [key, raw, opts] = mockRedis.set.mock.calls[0];
    expect(key).toBe('bk:last:ok');
    expect(opts).toEqual({ ex: 90 * 24 * 3600 });
    const payload = JSON.parse(raw as string);
    expect(payload.key).toBe('backups/2026-05-13.json.gz');
    expect(payload.bytes).toBe(1234);
    expect(typeof payload.at).toBe('string');
    expect(new Date(payload.at).toString()).not.toBe('Invalid Date');
  });

  it('swallows Redis errors — fail-open', async () => {
    mockRedis.set.mockRejectedValueOnce(new Error('Redis down'));
    await expect(
      markBackupAttempt({ ok: true, key: 'k', bytes: 1 })
    ).resolves.toBeUndefined();
  });
});

describe('markBackupAttempt — error path', () => {
  it('writes bk:last:err with code + error message', async () => {
    await markBackupAttempt({ ok: false, code: 'UPLOAD_FAILED', error: 'bucket missing' });
    const [key, raw] = mockRedis.set.mock.calls[0];
    expect(key).toBe('bk:last:err');
    const payload = JSON.parse(raw as string);
    expect(payload.code).toBe('UPLOAD_FAILED');
    expect(payload.error).toBe('bucket missing');
  });
});

describe('getLastBackupSuccess', () => {
  it('parses a JSON string payload', async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({ at: '2026-05-13T10:00:00Z', key: 'backups/2026-05-13.json.gz', bytes: 999 }),
    );
    const out = await getLastBackupSuccess();
    expect(out).toEqual({ at: '2026-05-13T10:00:00Z', key: 'backups/2026-05-13.json.gz', bytes: 999 });
  });

  it('accepts an already-parsed object (Upstash auto-deserialises JSON sometimes)', async () => {
    mockRedis.get.mockResolvedValueOnce({ at: '2026-05-13T10:00:00Z', key: 'k', bytes: 1 });
    expect(await getLastBackupSuccess()).toEqual({ at: '2026-05-13T10:00:00Z', key: 'k', bytes: 1 });
  });

  it('returns null when unset', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    expect(await getLastBackupSuccess()).toBeNull();
  });

  it('returns null on corrupt JSON', async () => {
    mockRedis.get.mockResolvedValueOnce('{not-json');
    expect(await getLastBackupSuccess()).toBeNull();
  });

  it('returns null on Redis error — fail-open', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('timeout'));
    expect(await getLastBackupSuccess()).toBeNull();
  });
});

describe('getLastBackupError', () => {
  it('parses a JSON string payload', async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({ at: '2026-05-13T10:00:00Z', code: 'READ_FAILED', error: 'connection lost' }),
    );
    expect(await getLastBackupError()).toEqual({
      at: '2026-05-13T10:00:00Z',
      code: 'READ_FAILED',
      error: 'connection lost',
    });
  });

  it('returns null when unset', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    expect(await getLastBackupError()).toBeNull();
  });
});

describe('Redis not configured — fail-open', () => {
  it('all helpers behave like Redis is empty when env vars missing', async () => {
    vi.resetModules();
    const saved = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const mod = await import('../backup-health');
      await expect(mod.markBackupAttempt({ ok: true, key: 'k', bytes: 1 })).resolves.toBeUndefined();
      expect(await mod.getLastBackupSuccess()).toBeNull();
      expect(await mod.getLastBackupError()).toBeNull();
    } finally {
      process.env.UPSTASH_REDIS_REST_URL = saved.url;
      process.env.UPSTASH_REDIS_REST_TOKEN = saved.token;
    }
  });
});

// ─── Freshness + real-time alert bonuses ─────────────────────────────────

describe('getBackupFreshness', () => {
  it('reports stale=true when no successful run is recorded', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    const f = await getBackupFreshness(new Date('2026-05-14T12:00:00Z'));
    expect(f.stale).toBe(true);
    expect(f.hoursSinceLast).toBeNull();
    expect(f.lastSuccessAt).toBeNull();
  });

  it('reports stale=false when last success is fresh', async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({ at: '2026-05-14T10:00:00Z', key: 'k', bytes: 1 }),
    );
    const f = await getBackupFreshness(new Date('2026-05-14T12:00:00Z'));
    expect(f.stale).toBe(false);
    expect(f.hoursSinceLast).toBeCloseTo(2, 5);
    expect(f.lastSuccessAt).toBe('2026-05-14T10:00:00Z');
  });

  it(`reports stale=true at exactly the ${BACKUP_STALE_THRESHOLD_HOURS}h boundary`, async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({ at: '2026-05-13T11:00:00Z', key: 'k', bytes: 1 }),
    );
    const f = await getBackupFreshness(new Date('2026-05-14T12:00:00Z'));
    expect(f.hoursSinceLast).toBeCloseTo(25, 5);
    expect(f.stale).toBe(true);
  });

  it('reports stale=false at 24h59min (just before the boundary)', async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({ at: '2026-05-13T11:01:00Z', key: 'k', bytes: 1 }),
    );
    const f = await getBackupFreshness(new Date('2026-05-14T12:00:00Z'));
    expect(f.stale).toBe(false);
  });

  it('reports stale=true when the recorded timestamp is unparseable', async () => {
    mockRedis.get.mockResolvedValueOnce(
      JSON.stringify({ at: 'not-a-date', key: 'k', bytes: 1 }),
    );
    const f = await getBackupFreshness(new Date('2026-05-14T12:00:00Z'));
    expect(f.stale).toBe(true);
    expect(f.hoursSinceLast).toBeNull();
    expect(f.lastSuccessAt).toBe('not-a-date');
  });
});

describe('notifyBackupFailure', () => {
  it('broadcasts SMS to every SUPERADMIN with a phone', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { phone: '+212600000001' },
      { phone: '+212600000002' },
    ]);
    await notifyBackupFailure('UPLOAD_FAILED', 'bucket missing');
    expect(mockTryAcquireFlag).toHaveBeenCalledWith('bk:alert:err:UPLOAD_FAILED', 3600);
    expect(mockSendSmsNow).toHaveBeenCalledTimes(2);
    const calls = mockSendSmsNow.mock.calls.map((c) => c[0]);
    expect(calls[0].to).toBe('+212600000001');
    expect(calls[0].message).toContain('UPLOAD_FAILED');
    expect(calls[0].message).toContain('bucket missing');
    expect(calls[1].to).toBe('+212600000002');
  });

  it('skips when the dedup flag is already set (same error code, same hour)', async () => {
    mockTryAcquireFlag.mockResolvedValueOnce(false);
    await notifyBackupFailure('UPLOAD_FAILED', 'bucket missing');
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    expect(mockSendSmsNow).not.toHaveBeenCalled();
  });

  it('truncates the error message to keep SMS short', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([{ phone: '+212600000001' }]);
    const long = 'x'.repeat(500);
    await notifyBackupFailure('UNKNOWN', long);
    const msg: string = mockSendSmsNow.mock.calls[0][0].message;
    // Header + "…" + truncated body should stay well under 160 chars.
    expect(msg.length).toBeLessThan(170);
    expect(msg.endsWith('…')).toBe(true);
  });

  it('survives a Prisma lookup failure without throwing', async () => {
    mockPrisma.user.findMany.mockRejectedValueOnce(new Error('DB unreachable'));
    await expect(notifyBackupFailure('X', 'y')).resolves.toBeUndefined();
    expect(mockSendSmsNow).not.toHaveBeenCalled();
  });

  it('is fired automatically by markBackupAttempt({ ok: false })', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([{ phone: '+212600000001' }]);
    await markBackupAttempt({ ok: false, code: 'STORAGE_TIMEOUT', error: 'gateway 504' });
    // markBackupAttempt fires the alert fire-and-forget — wait one tick.
    await new Promise((r) => setImmediate(r));
    expect(mockTryAcquireFlag).toHaveBeenCalledWith('bk:alert:err:STORAGE_TIMEOUT', 3600);
    expect(mockSendSmsNow).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on a successful attempt', async () => {
    await markBackupAttempt({ ok: true, key: 'k', bytes: 1 });
    await new Promise((r) => setImmediate(r));
    expect(mockSendSmsNow).not.toHaveBeenCalled();
  });
});

describe('notifyBackupStale', () => {
  it('returns false (no SMS) when freshness reports stale=false', async () => {
    const fired = await notifyBackupStale({
      stale: false,
      hoursSinceLast: 5,
      lastSuccessAt: '2026-05-14T07:00:00Z',
    });
    expect(fired).toBe(false);
    expect(mockTryAcquireFlag).not.toHaveBeenCalled();
    expect(mockSendSmsNow).not.toHaveBeenCalled();
  });

  it('broadcasts once per UTC day when stale=true', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([
      { phone: '+212600000001' },
      { phone: null },                 // filtered out
      { phone: '+212600000003' },
    ]);
    const fired = await notifyBackupStale(
      { stale: true, hoursSinceLast: 36, lastSuccessAt: '2026-05-13T00:00:00Z' },
      new Date('2026-05-14T12:00:00Z'),
    );
    expect(fired).toBe(true);
    expect(mockTryAcquireFlag).toHaveBeenCalledWith('bk:alert:stale:2026-05-14', 24 * 3600);
    expect(mockSendSmsNow).toHaveBeenCalledTimes(2);
    expect(mockSendSmsNow.mock.calls[0][0].message).toContain('36h');
  });

  it('says "jamais" when hoursSinceLast is null', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([{ phone: '+212600000001' }]);
    await notifyBackupStale(
      { stale: true, hoursSinceLast: null, lastSuccessAt: null },
      new Date('2026-05-14T12:00:00Z'),
    );
    expect(mockSendSmsNow.mock.calls[0][0].message).toContain('jamais');
  });

  it('returns false silently when the daily dedup flag is already set', async () => {
    mockTryAcquireFlag.mockResolvedValueOnce(false);
    const fired = await notifyBackupStale(
      { stale: true, hoursSinceLast: 100, lastSuccessAt: '2026-05-10T00:00:00Z' },
      new Date('2026-05-14T12:00:00Z'),
    );
    expect(fired).toBe(false);
    expect(mockSendSmsNow).not.toHaveBeenCalled();
  });

  it('dedup key uses the UTC date passed in `now` (not server-local time)', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([{ phone: '+212600000001' }]);
    // 23:59 UTC May 14 → ymd is still 2026-05-14. 00:01 UTC May 15 → 2026-05-15.
    await notifyBackupStale(
      { stale: true, hoursSinceLast: 30, lastSuccessAt: 'irrelevant' },
      new Date('2026-05-15T00:01:00Z'),
    );
    expect(mockTryAcquireFlag).toHaveBeenCalledWith('bk:alert:stale:2026-05-15', 24 * 3600);
  });
});
