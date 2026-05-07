/**
 * Unit tests — GET /api/health
 *
 * Mocks: prisma, redis health, supabase storage health, BullMQ queues.
 * Validates the public payload shape so external monitors (UptimeRobot,
 * Vercel) keep working when collaborators change.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn() },
  checkRedisHealth: vi.fn(),
  checkStorageHealth: vi.fn(),
  isBullMQConfigured: vi.fn(),
  getDlqQueue: vi.fn(),
  getEmailQueue: vi.fn(),
  getSmsQueue: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/cache', () => ({ checkRedisHealth: mocks.checkRedisHealth }));
vi.mock('@/lib/supabase', () => ({ checkStorageHealth: mocks.checkStorageHealth }));
vi.mock('@/lib/redis-bullmq', () => ({ isBullMQConfigured: mocks.isBullMQConfigured }));
vi.mock('@/lib/queues/index', () => ({
  getDlqQueue: mocks.getDlqQueue,
  getEmailQueue: mocks.getEmailQueue,
  getSmsQueue: mocks.getSmsQueue,
  DLQ_WARNING_THRESHOLD: 10,
}));
vi.mock('@sentry/nextjs', () => ({ captureMessage: mocks.captureMessage }));

import { GET } from '@/app/api/health/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  mocks.checkRedisHealth.mockResolvedValue(true);
  mocks.checkStorageHealth.mockResolvedValue(true);
  mocks.isBullMQConfigured.mockReturnValue(false); // skipped queues
});

describe('GET /api/health', () => {
  it('returns 200 + status:ok when all services are healthy', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(body.redis).toBe('ok');
    expect(body.storage).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });

  it('returns 503 + status:error when DB query fails', async () => {
    mocks.prisma.$queryRaw.mockRejectedValueOnce(new Error('DB down'));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.db).toBe('error');
  });

  it('returns 200 + status:degraded when Redis is unreachable but DB ok', async () => {
    mocks.checkRedisHealth.mockResolvedValueOnce(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.redis).toBe('degraded');
  });

  it('returns 200 + status:degraded when Storage is unreachable', async () => {
    mocks.checkStorageHealth.mockResolvedValueOnce(false);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.storage).toBe('degraded');
  });

  it('exposes the queue + dlq shape regardless of BullMQ availability', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty('dlq');
    expect(body).toHaveProperty('queues');
    expect(body.queues).toHaveProperty('email');
    expect(body.queues).toHaveProperty('sms');
  });
});
