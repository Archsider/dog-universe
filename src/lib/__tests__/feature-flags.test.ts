import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function () { return mockRedis; }),
}));

const { findUniqueMock, findManyMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    featureFlag: {
      findUnique: findUniqueMock,
      findMany:   findManyMock,
    },
  },
}));

process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

import {
  bucketFor,
  evaluateFlag,
  isFeatureEnabled,
  getAllFlagsForUser,
  type FeatureFlagRecord,
} from '../feature-flags';

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(1);
});

function flag(over: Partial<FeatureFlagRecord> = {}): FeatureFlagRecord {
  return {
    key: 'test-flag',
    description: '',
    enabled: true,
    rolloutPercent: 0,
    targetRoles: [],
    userWhitelist: [],
    ...over,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// bucketFor — déterministe, distribution raisonnable
// ───────────────────────────────────────────────────────────────────────────
describe('bucketFor', () => {
  it('même userId+key → même bucket sur 1000 calls', () => {
    const b = bucketFor('user-abc', 'feature-x');
    for (let i = 0; i < 1000; i++) {
      expect(bucketFor('user-abc', 'feature-x')).toBe(b);
    }
  });

  it('bucket toujours dans [0, 99]', () => {
    for (let i = 0; i < 200; i++) {
      const b = bucketFor(`u${i}`, 'k');
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  it('users différents → buckets variés (pas tous identiques)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(bucketFor(`u${i}`, 'k'));
    expect(seen.size).toBeGreaterThan(20);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// evaluateFlag — règles métier pures
// ───────────────────────────────────────────────────────────────────────────
describe('evaluateFlag — kill-switch global', () => {
  it('enabled=false → false même si whitelist + rollout 100', () => {
    const f = flag({ enabled: false, rolloutPercent: 100, userWhitelist: ['u1'] });
    expect(evaluateFlag(f, { userId: 'u1', role: 'CLIENT' })).toBe(false);
  });

  it('flag inexistant (null) → false', () => {
    expect(evaluateFlag(null, { userId: 'u1', role: 'CLIENT' })).toBe(false);
  });
});

describe('evaluateFlag — whitelist override', () => {
  it('userId ∈ whitelist → true même si rolloutPercent=0', () => {
    const f = flag({ rolloutPercent: 0, userWhitelist: ['u1'] });
    expect(evaluateFlag(f, { userId: 'u1', role: 'CLIENT' })).toBe(true);
  });

  it('whitelist bypass le filtre de rôle', () => {
    const f = flag({ targetRoles: ['SUPERADMIN'], userWhitelist: ['u1'] });
    expect(evaluateFlag(f, { userId: 'u1', role: 'CLIENT' })).toBe(true);
  });
});

describe('evaluateFlag — role filter', () => {
  it('role ∉ targetRoles → false', () => {
    const f = flag({ targetRoles: ['SUPERADMIN'], rolloutPercent: 100 });
    expect(evaluateFlag(f, { userId: 'u1', role: 'CLIENT' })).toBe(false);
  });

  it('role ∈ targetRoles + rollout 100 → true', () => {
    const f = flag({ targetRoles: ['ADMIN', 'SUPERADMIN'], rolloutPercent: 100 });
    expect(evaluateFlag(f, { userId: 'u1', role: 'ADMIN' })).toBe(true);
  });

  it('targetRoles vide = pas de filtre', () => {
    const f = flag({ targetRoles: [], rolloutPercent: 100 });
    expect(evaluateFlag(f, { userId: 'u1', role: 'CLIENT' })).toBe(true);
  });

  it('role manquant + targetRoles défini → false', () => {
    const f = flag({ targetRoles: ['ADMIN'], rolloutPercent: 100 });
    expect(evaluateFlag(f, { userId: 'u1', role: null })).toBe(false);
  });
});

describe('evaluateFlag — rollout sticky', () => {
  it('même user → même résultat sur 100 calls (sticky)', () => {
    const f = flag({ rolloutPercent: 50 });
    const first = evaluateFlag(f, { userId: 'sticky-u', role: 'CLIENT' });
    for (let i = 0; i < 100; i++) {
      expect(evaluateFlag(f, { userId: 'sticky-u', role: 'CLIENT' })).toBe(first);
    }
  });

  it('rolloutPercent=100 → toujours true', () => {
    const f = flag({ rolloutPercent: 100 });
    for (let i = 0; i < 50; i++) {
      expect(evaluateFlag(f, { userId: `u${i}`, role: 'CLIENT' })).toBe(true);
    }
  });

  it('rolloutPercent=0 → toujours false (sans whitelist)', () => {
    const f = flag({ rolloutPercent: 0 });
    for (let i = 0; i < 50; i++) {
      expect(evaluateFlag(f, { userId: `u${i}`, role: 'CLIENT' })).toBe(false);
    }
  });

  it('anonyme (pas de userId) + rollout < 100 → false', () => {
    const f = flag({ rolloutPercent: 50 });
    expect(evaluateFlag(f, { userId: null, role: null })).toBe(false);
  });

  it('anonyme + rollout = 100 → true', () => {
    const f = flag({ rolloutPercent: 100 });
    expect(evaluateFlag(f, { userId: null, role: null })).toBe(true);
  });

  it('distribution rollout 30% sur 1000 users ~ 25-35%', () => {
    const f = flag({ rolloutPercent: 30 });
    let on = 0;
    for (let i = 0; i < 1000; i++) {
      if (evaluateFlag(f, { userId: `user-${i}`, role: 'CLIENT' })) on++;
    }
    expect(on).toBeGreaterThan(200);
    expect(on).toBeLessThan(400);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// isFeatureEnabled — intégration cache + DB
// ───────────────────────────────────────────────────────────────────────────
describe('isFeatureEnabled', () => {
  it('cache hit → pas de hit DB', async () => {
    mockRedis.get.mockResolvedValueOnce(flag({ enabled: true, rolloutPercent: 100 }));
    const res = await isFeatureEnabled('test-flag', { userId: 'u1', role: 'CLIENT' });
    expect(res).toBe(true);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('cache miss → lit DB et stocke', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    findUniqueMock.mockResolvedValueOnce({
      key: 'test-flag', description: '', enabled: true,
      rolloutPercent: 100, targetRoles: [], userWhitelist: [],
    });
    const res = await isFeatureEnabled('test-flag', { userId: 'u1', role: 'CLIENT' });
    expect(res).toBe(true);
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { key: 'test-flag' } });
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it('flag absent en DB → false (et cache négatif)', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    findUniqueMock.mockResolvedValueOnce(null);
    expect(await isFeatureEnabled('missing', { userId: 'u1' })).toBe(false);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'ff:missing',
      expect.objectContaining({ __null: true }),
      expect.objectContaining({ ex: expect.any(Number) }),
    );
  });

  it('cache négatif (__null) court-circuite la DB', async () => {
    mockRedis.get.mockResolvedValueOnce({ __null: true });
    expect(await isFeatureEnabled('missing', { userId: 'u1' })).toBe(false);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('DB throw → false (safe default)', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    findUniqueMock.mockRejectedValueOnce(new Error('DB down'));
    expect(await isFeatureEnabled('test-flag', { userId: 'u1' })).toBe(false);
  });
});

describe('getAllFlagsForUser', () => {
  it('retourne map { key: bool } pour chaque flag', async () => {
    findManyMock.mockResolvedValueOnce([
      { key: 'a', description: '', enabled: true, rolloutPercent: 100, targetRoles: [], userWhitelist: [] },
      { key: 'b', description: '', enabled: false, rolloutPercent: 100, targetRoles: [], userWhitelist: [] },
      { key: 'c', description: '', enabled: true, rolloutPercent: 0, targetRoles: [], userWhitelist: ['u1'] },
    ]);
    const out = await getAllFlagsForUser({ userId: 'u1', role: 'CLIENT' });
    expect(out).toEqual({ a: true, b: false, c: true });
  });

  it('DB down → {} (safe default)', async () => {
    findManyMock.mockRejectedValueOnce(new Error('boom'));
    expect(await getAllFlagsForUser({ userId: 'u1', role: 'CLIENT' })).toEqual({});
  });
});
