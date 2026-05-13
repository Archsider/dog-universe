import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function () { return mockRedis; }),
}));

process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

import { markBackupAttempt, getLastBackupSuccess, getLastBackupError } from '../backup-health';

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
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
