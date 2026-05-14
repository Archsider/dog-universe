/**
 * Unit tests — GET /api/admin/diagnostics (SUPERADMIN-only).
 *
 * Mocks: auth, prisma.actionLog, queues, redis-bullmq, cache (worker last run).
 * Validates auth gating (401/403/200), payload shape, and tolerance: a queue
 * counter throwing must surface as `{ error: ... }` for that queue, not crash
 * the whole endpoint.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isBullMQConfigured: vi.fn(),
  getEmailQueue: vi.fn(),
  getSmsQueue: vi.fn(),
  getDlqQueue: vi.fn(),
  getWorkerLastRun: vi.fn(),
  prisma: {
    actionLog: { findFirst: vi.fn() },
    smsLog: { findFirst: vi.fn() },
  },
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/redis-bullmq', () => ({ isBullMQConfigured: mocks.isBullMQConfigured }));
vi.mock('@/lib/queues/index', () => ({
  getEmailQueue: mocks.getEmailQueue,
  getSmsQueue: mocks.getSmsQueue,
  getDlqQueue: mocks.getDlqQueue,
}));
vi.mock('@/lib/cache', () => ({ getWorkerLastRun: mocks.getWorkerLastRun }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

import { GET } from '@/app/api/admin/diagnostics/route';

function makeQueueOk(counts: Record<string, number>, completed: Array<{ finishedOn?: number }> = []) {
  return {
    getJobCounts: vi.fn().mockResolvedValue(counts),
    getCompleted: vi.fn().mockResolvedValue(completed),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isBullMQConfigured.mockReturnValue(true);
  mocks.getEmailQueue.mockReturnValue(makeQueueOk({ waiting: 1, active: 0, completed: 5, failed: 0, delayed: 0 }));
  mocks.getSmsQueue.mockReturnValue(makeQueueOk({ waiting: 0, active: 0, completed: 2, failed: 0, delayed: 0 }));
  mocks.getDlqQueue.mockReturnValue(makeQueueOk({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }));
  mocks.getWorkerLastRun.mockResolvedValue(new Date().toISOString());
  mocks.prisma.actionLog.findFirst.mockResolvedValue(null);
  mocks.prisma.smsLog.findFirst.mockResolvedValue(null);
});

describe('GET /api/admin/diagnostics', () => {
  it('returns 401 when no session', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 for CLIENT', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'u1', role: 'CLIENT' } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 403 for ADMIN (SUPERADMIN-only)', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'u2', role: 'ADMIN' } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 200 + full structure for SUPERADMIN', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa', role: 'SUPERADMIN' } });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('env');
    expect(body.env).toHaveProperty('email');
    expect(body.env).toHaveProperty('sms');
    expect(body.env).toHaveProperty('redis');
    expect(body.env).toHaveProperty('auth');
    expect(body.env).toHaveProperty('storage');
    expect(body).toHaveProperty('queues');
    expect(body.queues).toHaveProperty('bullmqConfigured', true);
    expect(body.queues.email).toHaveProperty('waiting', 1);
    expect(body.queues.sms).toHaveProperty('completed', 2);
    expect(body.queues.dlq).toHaveProperty('waiting', 0);
    expect(body).toHaveProperty('workerLastRun');
    expect(body).toHaveProperty('lastSuccessfulSends');
    expect(body).toHaveProperty('ts');
  });

  it('exposes only booleans in env (no secret values leak)', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa', role: 'SUPERADMIN' } });
    const res = await GET();
    const body = await res.json();
    const flatten = (o: unknown): unknown[] =>
      o && typeof o === 'object' ? Object.values(o as Record<string, unknown>).flatMap(flatten) : [o];
    for (const v of flatten(body.env)) {
      expect(typeof v).toBe('boolean');
    }
  });

  it('tolerates a queue throwing — surfaces error per-queue, not 500', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa', role: 'SUPERADMIN' } });
    mocks.getEmailQueue.mockImplementationOnce(() => {
      throw new Error('redis disconnected');
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queues.email).toHaveProperty('error');
    expect(body.queues.email.error).toContain('redis');
    // Other queues must still report counts
    expect(body.queues.sms).toHaveProperty('completed');
  });

  it('returns BullMQ disabled section when not configured', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa', role: 'SUPERADMIN' } });
    mocks.isBullMQConfigured.mockReturnValueOnce(false);
    const res = await GET();
    const body = await res.json();
    expect(body.queues.bullmqConfigured).toBe(false);
    expect(body.queues.email).toHaveProperty('error');
    expect(body.queues.sms).toHaveProperty('error');
    expect(body.queues.dlq).toHaveProperty('error');
  });

  it('reports null lastSuccessfulSends when no ActionLog rows', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa', role: 'SUPERADMIN' } });
    const res = await GET();
    const body = await res.json();
    expect(body.lastSuccessfulSends.email).toBeNull();
    expect(body.lastSuccessfulSends.sms).toBeNull();
  });

  it('reports last send ISO string when SmsLog + BullMQ have entries', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa', role: 'SUPERADMIN' } });
    const fakeDate = new Date('2026-05-07T10:00:00Z');
    // Email side: BullMQ getCompleted(0, 0) returns the latest finished job.
    //
    // getEmailQueue() is called TWICE in this route — once for the queue
    // counts probe and once inside lastEmailSentIso. Both run inside the
    // same Promise.all, so the resolution order is non-deterministic. Using
    // `mockReturnValueOnce` here caused a 50/50 flake (the queue probe
    // sometimes ate the only mocked return value, leaving lastEmailSentIso
    // with `undefined`). Use `mockReturnValue` so BOTH calls get the
    // completed jobs array.
    mocks.getEmailQueue.mockReturnValue(
      makeQueueOk(
        { waiting: 1, active: 0, completed: 5, failed: 0, delayed: 0 },
        [{ finishedOn: fakeDate.getTime() }],
      ),
    );
    // SMS side: SmsLog.findFirst orderBy sentAt desc returns the latest row.
    mocks.prisma.smsLog.findFirst.mockResolvedValue({ sentAt: fakeDate });
    const res = await GET();
    const body = await res.json();
    expect(body.lastSuccessfulSends.email).toBe(fakeDate.toISOString());
    expect(body.lastSuccessfulSends.sms).toBe(fakeDate.toISOString());
  });
});
