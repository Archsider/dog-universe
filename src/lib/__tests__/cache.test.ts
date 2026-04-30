import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.hoisted ensures mockRedis is defined before vi.mock factory runs
const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  // Must use a regular function (not arrow) so `new Redis({...})` works
  Redis: vi.fn(function() { return mockRedis; }),
}));

// Set env vars before any test calls getRedis() for the first time.
// cache.ts defers getRedis() to call time, not import time, so this is safe.
process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

import { cacheGet, cacheSet, cacheDel, cacheReadThrough, CacheKeys, CacheTTL } from '../cache';

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(1);
});

// ---------------------------------------------------------------------------
// cacheGet
// ---------------------------------------------------------------------------
describe('cacheGet', () => {
  it('returns parsed value on cache hit', async () => {
    mockRedis.get.mockResolvedValueOnce({ dogs: 20, cats: 10 });
    expect(await cacheGet('my-key')).toEqual({ dogs: 20, cats: 10 });
    expect(mockRedis.get).toHaveBeenCalledWith('my-key');
  });

  it('returns null on cache miss', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    expect(await cacheGet('my-key')).toBeNull();
  });

  it('returns null on Redis error — fail-open', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('Redis timeout'));
    expect(await cacheGet('my-key')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cacheSet
// ---------------------------------------------------------------------------
describe('cacheSet', () => {
  it('calls redis.set with key, value and TTL', async () => {
    await cacheSet('cap', { dogs: 20 }, 300);
    expect(mockRedis.set).toHaveBeenCalledWith('cap', { dogs: 20 }, { ex: 300 });
  });

  it('silently ignores Redis error — fail-open', async () => {
    mockRedis.set.mockRejectedValueOnce(new Error('Redis down'));
    await expect(cacheSet('k', 'v', 60)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cacheDel
// ---------------------------------------------------------------------------
describe('cacheDel', () => {
  it('calls redis.del with the key', async () => {
    await cacheDel('my-key');
    expect(mockRedis.del).toHaveBeenCalledWith('my-key');
  });

  it('silently ignores Redis error — fail-open', async () => {
    mockRedis.del.mockRejectedValueOnce(new Error('Redis down'));
    await expect(cacheDel('my-key')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cacheReadThrough
// ---------------------------------------------------------------------------
describe('cacheReadThrough', () => {
  it('returns cached value without calling loader on hit', async () => {
    mockRedis.get.mockResolvedValueOnce({ dogs: 20, cats: 10 });
    const loader = vi.fn();
    expect(await cacheReadThrough('k', 300, loader)).toEqual({ dogs: 20, cats: 10 });
    expect(loader).not.toHaveBeenCalled();
  });

  it('calls loader on cache miss and stores result in cache', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    const loader = vi.fn().mockResolvedValue({ dogs: 15 });
    const result = await cacheReadThrough('k', 300, loader);
    expect(result).toEqual({ dogs: 15 });
    expect(loader).toHaveBeenCalledOnce();
    expect(mockRedis.set).toHaveBeenCalledWith('k', { dogs: 15 }, { ex: 300 });
  });

  it('calls loader when Redis GET throws — fail-open', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('Redis down'));
    const loader = vi.fn().mockResolvedValue('fresh');
    expect(await cacheReadThrough('k', 60, loader)).toBe('fresh');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('propagates loader errors — DB failures are not silenced', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    const loader = vi.fn().mockRejectedValue(new Error('DB connection failed'));
    await expect(cacheReadThrough('k', 300, loader)).rejects.toThrow('DB connection failed');
  });
});

// ---------------------------------------------------------------------------
// CacheKeys
// ---------------------------------------------------------------------------
describe('CacheKeys', () => {
  it('capacityLimits() returns the same constant key every time', () => {
    expect(CacheKeys.capacityLimits()).toBe('cache:capacity:limits');
    expect(CacheKeys.capacityLimits()).toBe(CacheKeys.capacityLimits());
  });

  it('loyaltyGrade(userId) is scoped per user — different users get different keys', () => {
    expect(CacheKeys.loyaltyGrade('user-1')).toBe('cache:loyalty:user-1');
    expect(CacheKeys.loyaltyGrade('user-2')).toBe('cache:loyalty:user-2');
    expect(CacheKeys.loyaltyGrade('user-1')).not.toBe(CacheKeys.loyaltyGrade('user-2'));
  });

  it('notifCount(userId) is scoped per user', () => {
    expect(CacheKeys.notifCount('u1')).toBe('cache:notif:count:u1');
    expect(CacheKeys.notifCount('u2')).toBe('cache:notif:count:u2');
  });
});

// ---------------------------------------------------------------------------
// CacheTTL
// ---------------------------------------------------------------------------
describe('CacheTTL', () => {
  it('capacityLimits is 300 seconds (5 min)', () => {
    expect(CacheTTL.capacityLimits).toBe(300);
  });

  it('loyaltyGrade is 300 seconds (5 min)', () => {
    expect(CacheTTL.loyaltyGrade).toBe(300);
  });

  it('notifCount is 30 seconds', () => {
    expect(CacheTTL.notifCount).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Redis not configured — fail-open (no env vars)
// ---------------------------------------------------------------------------
describe('Redis not configured — fail-open', () => {
  it('cacheGet returns null without crashing', async () => {
    vi.resetModules();
    const saved = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const { cacheGet: fn } = await import('../cache');
      expect(await fn('any-key')).toBeNull();
    } finally {
      process.env.UPSTASH_REDIS_REST_URL = saved.url;
      process.env.UPSTASH_REDIS_REST_TOKEN = saved.token;
    }
  });

  it('cacheSet is a no-op without crashing', async () => {
    vi.resetModules();
    const saved = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const { cacheSet: fn } = await import('../cache');
      await expect(fn('key', 'value', 60)).resolves.toBeUndefined();
    } finally {
      process.env.UPSTASH_REDIS_REST_URL = saved.url;
      process.env.UPSTASH_REDIS_REST_TOKEN = saved.token;
    }
  });

  it('cacheReadThrough calls loader directly when no Redis', async () => {
    vi.resetModules();
    const saved = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const { cacheReadThrough: fn } = await import('../cache');
      const loader = vi.fn().mockResolvedValue({ dogs: 20 });
      expect(await fn('k', 300, loader)).toEqual({ dogs: 20 });
      expect(loader).toHaveBeenCalledOnce();
    } finally {
      process.env.UPSTASH_REDIS_REST_URL = saved.url;
      process.env.UPSTASH_REDIS_REST_TOKEN = saved.token;
    }
  });
});
