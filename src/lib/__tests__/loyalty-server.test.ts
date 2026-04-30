// Tests for src/lib/loyalty-server.ts — the server-only cache layer.
// The pure loyalty logic (calculateSuggestedGrade, grades, benefits) is already
// fully tested in src/__tests__/loyalty.test.ts.

import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.hoisted ensures variables are defined before vi.mock factories run
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockCacheReadThrough = vi.hoisted(() => vi.fn());
const mockCacheDel = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  prisma: {
    loyaltyGrade: { findUnique: mockFindUnique },
  },
}));

vi.mock('@/lib/cache', () => ({
  cacheReadThrough: mockCacheReadThrough,
  cacheDel: mockCacheDel,
  CacheKeys: {
    loyaltyGrade: (userId: string) => `cache:loyalty:${userId}`,
    capacityLimits: () => 'cache:capacity:limits',
    notifCount: (userId: string) => `cache:notif:count:${userId}`,
  },
  CacheTTL: { loyaltyGrade: 300, capacityLimits: 300, notifCount: 30 },
}));

import { getLoyaltyGrade, invalidateLoyaltyCache } from '../loyalty-server';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getLoyaltyGrade — cache hit
// ---------------------------------------------------------------------------
describe('getLoyaltyGrade — cache hit', () => {
  it('returns the cached grade without querying the DB', async () => {
    mockCacheReadThrough.mockResolvedValueOnce({ grade: 'GOLD', isOverride: false });
    const result = await getLoyaltyGrade('user-123');
    expect(result).toEqual({ grade: 'GOLD', isOverride: false });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('uses the correct cache key (scoped to userId)', async () => {
    mockCacheReadThrough.mockResolvedValueOnce(null);
    await getLoyaltyGrade('user-abc');
    expect(mockCacheReadThrough).toHaveBeenCalledWith(
      'cache:loyalty:user-abc',
      300,
      expect.any(Function),
    );
  });
});

// ---------------------------------------------------------------------------
// getLoyaltyGrade — cache miss (loader called)
// ---------------------------------------------------------------------------
describe('getLoyaltyGrade — cache miss', () => {
  it('queries DB via loader and returns the grade row', async () => {
    // Simulate cache miss: cacheReadThrough calls the loader
    mockCacheReadThrough.mockImplementationOnce(
      (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
    );
    mockFindUnique.mockResolvedValueOnce({ grade: 'PLATINUM', isOverride: true });

    const result = await getLoyaltyGrade('user-xyz');
    expect(result).toEqual({ grade: 'PLATINUM', isOverride: true });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { clientId: 'user-xyz' },
      select: { grade: true, isOverride: true },
    });
  });

  it('returns null when no LoyaltyGrade row exists for the user', async () => {
    mockCacheReadThrough.mockImplementationOnce(
      (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
    );
    mockFindUnique.mockResolvedValueOnce(null);

    const result = await getLoyaltyGrade('brand-new-user');
    expect(result).toBeNull();
  });

  it('returns BRONZE grade correctly', async () => {
    mockCacheReadThrough.mockImplementationOnce(
      (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
    );
    mockFindUnique.mockResolvedValueOnce({ grade: 'BRONZE', isOverride: false });
    const result = await getLoyaltyGrade('u1');
    expect(result).toEqual({ grade: 'BRONZE', isOverride: false });
  });

  it('returns SILVER grade correctly', async () => {
    mockCacheReadThrough.mockImplementationOnce(
      (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
    );
    mockFindUnique.mockResolvedValueOnce({ grade: 'SILVER', isOverride: false });
    const result = await getLoyaltyGrade('u2');
    expect(result).toEqual({ grade: 'SILVER', isOverride: false });
  });
});

// ---------------------------------------------------------------------------
// invalidateLoyaltyCache
// ---------------------------------------------------------------------------
describe('invalidateLoyaltyCache', () => {
  it('calls cacheDel with the loyalty grade key for the user', async () => {
    await invalidateLoyaltyCache('user-789');
    expect(mockCacheDel).toHaveBeenCalledWith('cache:loyalty:user-789');
  });

  it('different users get different cache keys invalidated', async () => {
    await invalidateLoyaltyCache('alice');
    await invalidateLoyaltyCache('bob');
    expect(mockCacheDel).toHaveBeenNthCalledWith(1, 'cache:loyalty:alice');
    expect(mockCacheDel).toHaveBeenNthCalledWith(2, 'cache:loyalty:bob');
  });
});
