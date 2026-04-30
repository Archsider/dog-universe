import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockSet = vi.hoisted(() => vi.fn());

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function() { return { set: mockSet }; }),
}));

process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

import { tryAcquireIdempotency, IdempotencyKeyInvalidError } from '../idempotency';

// Helper: build a minimal Request with optional idempotency key header
const req = (key?: string): Request =>
  new Request('https://example.com/api/bookings', {
    method: 'POST',
    headers: key !== undefined ? { 'idempotency-key': key } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  // Default: SET NX succeeds (first writer)
  mockSet.mockResolvedValue('OK');
});

// ---------------------------------------------------------------------------
// No header — fail-open
// ---------------------------------------------------------------------------
describe('tryAcquireIdempotency — no header', () => {
  it('returns acquired=true when no Idempotency-Key header', async () => {
    const result = await tryAcquireIdempotency(req(), 'bookings:create');
    expect(result.acquired).toBe(true);
    expect(result.redisAvailable).toBe(false);
    expect(mockSet).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// First request — key acquired
// ---------------------------------------------------------------------------
describe('tryAcquireIdempotency — first writer', () => {
  it('returns acquired=true when Redis SET NX succeeds', async () => {
    mockSet.mockResolvedValueOnce('OK');
    const result = await tryAcquireIdempotency(req('abc-123-xyz-789'), 'bookings:create');
    expect(result.acquired).toBe(true);
    expect(result.redisAvailable).toBe(true);
  });

  it('calls Redis SET with NX flag and TTL', async () => {
    await tryAcquireIdempotency(req('my-key-12345'), 'bookings:create', 3600);
    expect(mockSet).toHaveBeenCalledWith(
      'idem:bookings:create:my-key-12345',
      '1',
      { nx: true, ex: 3600 },
    );
  });

  it('uses default TTL of 86400s (24h) when not specified', async () => {
    await tryAcquireIdempotency(req('my-key-12345'), 'scope');
    const call = mockSet.mock.calls[0];
    expect(call[2]).toEqual({ nx: true, ex: 24 * 3600 });
  });
});

// ---------------------------------------------------------------------------
// Duplicate request — replay
// ---------------------------------------------------------------------------
describe('tryAcquireIdempotency — duplicate / replay', () => {
  it('returns acquired=false when Redis SET NX returns null (key already exists)', async () => {
    mockSet.mockResolvedValueOnce(null); // SET NX → key already set
    const result = await tryAcquireIdempotency(req('dupe-key-0000'), 'bookings:create');
    expect(result.acquired).toBe(false);
    expect(result.redisAvailable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid key format — throws
// ---------------------------------------------------------------------------
describe('tryAcquireIdempotency — invalid key', () => {
  it('throws IdempotencyKeyInvalidError for key shorter than 8 chars', async () => {
    await expect(tryAcquireIdempotency(req('short'), 'scope'))
      .rejects.toBeInstanceOf(IdempotencyKeyInvalidError);
  });

  it('throws IdempotencyKeyInvalidError for key with spaces', async () => {
    await expect(tryAcquireIdempotency(req('invalid key here!'), 'scope'))
      .rejects.toBeInstanceOf(IdempotencyKeyInvalidError);
  });

  it('throws IdempotencyKeyInvalidError for key with special chars', async () => {
    await expect(tryAcquireIdempotency(req('key<script>'), 'scope'))
      .rejects.toBeInstanceOf(IdempotencyKeyInvalidError);
  });

  it('throws IdempotencyKeyInvalidError for key longer than 128 chars', async () => {
    const long = 'a'.repeat(129);
    await expect(tryAcquireIdempotency(req(long), 'scope'))
      .rejects.toBeInstanceOf(IdempotencyKeyInvalidError);
  });

  it('IdempotencyKeyInvalidError has the right message and name', () => {
    const err = new IdempotencyKeyInvalidError();
    expect(err.message).toBe('IDEMPOTENCY_KEY_INVALID');
    expect(err.name).toBe('IdempotencyKeyInvalidError');
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// Valid edge-case keys
// ---------------------------------------------------------------------------
describe('tryAcquireIdempotency — valid key edge cases', () => {
  it('accepts a 8-char minimum length key', async () => {
    await expect(tryAcquireIdempotency(req('12345678'), 'scope')).resolves.not.toThrow();
  });

  it('accepts a 128-char maximum length key', async () => {
    const max = 'a'.repeat(128);
    await expect(tryAcquireIdempotency(req(max), 'scope')).resolves.not.toThrow();
  });

  it('accepts UUID-format keys', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = await tryAcquireIdempotency(req(uuid), 'scope');
    expect(result.acquired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Redis error — fail-open
// ---------------------------------------------------------------------------
describe('tryAcquireIdempotency — Redis error', () => {
  it('returns acquired=true on Redis failure — fail-open', async () => {
    mockSet.mockRejectedValueOnce(new Error('Redis timeout'));
    const result = await tryAcquireIdempotency(req('abc12345'), 'scope');
    expect(result.acquired).toBe(true);
    expect(result.redisAvailable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Redis not configured — fail-open
// ---------------------------------------------------------------------------
describe('tryAcquireIdempotency — Redis not configured', () => {
  it('returns acquired=true when no Redis env vars', async () => {
    vi.resetModules();
    const saved = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const { tryAcquireIdempotency: fn } = await import('../idempotency');
      const result = await fn(req('abc12345'), 'scope');
      expect(result.acquired).toBe(true);
      expect(result.redisAvailable).toBe(false);
    } finally {
      process.env.UPSTASH_REDIS_REST_URL = saved.url;
      process.env.UPSTASH_REDIS_REST_TOKEN = saved.token;
    }
  });
});
