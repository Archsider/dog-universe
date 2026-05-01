/**
 * Unit tests — GET /api/cron/contract-reminders
 *
 * Mocks: prisma, sendEmail, getEmailTemplate, sendSMS, acquireCronLock
 * No real DB connection — all collaborators are stubbed via vi.mock().
 *
 * Auth note: this route accepts the secret via either:
 *   - Header `x-cron-secret: <secret>`
 *   - Header `authorization: Bearer <secret>`
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

process.env.CRON_SECRET = 'test-secret';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  return {
    prisma: {
      user: { findMany: vi.fn() },
      notification: {
        findMany: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      },
    },
    sendEmail: vi.fn().mockResolvedValue(undefined),
    getEmailTemplate: vi.fn().mockReturnValue({ subject: 'subj', html: '<p/>' }),
    sendSMS: vi.fn().mockResolvedValue(undefined),
    acquireCronLock: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEmailTemplate: mocks.getEmailTemplate,
}));
vi.mock('@/lib/sms', () => ({
  sendSMS: mocks.sendSMS,
  petPossessive: vi.fn().mockReturnValue('ses'),
  petVerb: vi.fn().mockReturnValue('est'),
  petCompanion: vi.fn().mockReturnValue('votre compagnon'),
  formatDateFR: (d: Date) => d.toISOString().slice(0, 10),
}));
vi.mock('@/lib/cron-lock', () => ({
  acquireCronLock: mocks.acquireCronLock,
}));

// Import handler AFTER mocks
import { GET } from '@/app/api/cron/contract-reminders/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(authHeader?: string, cronSecretHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers['authorization'] = authHeader;
  if (cronSecretHeader !== undefined) headers['x-cron-secret'] = cronSecretHeader;
  return new Request('https://example.com/api/cron/contract-reminders', { headers });
}

const clientWithoutContract = {
  id: 'client-1',
  name: 'Alice Dupont',
  email: 'alice@x.com',
  language: 'fr',
  phone: '+212600000001',
};

const clientWithoutPhone = {
  id: 'client-2',
  name: 'Bob Martin',
  email: 'bob@x.com',
  language: 'fr',
  phone: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: lock acquired (cron proceeds)
  mocks.acquireCronLock.mockResolvedValue(true);
  // Default: no clients without contract
  mocks.prisma.user.findMany.mockResolvedValue([]);
  // Default: no recent reminders
  mocks.prisma.notification.findMany.mockResolvedValue([]);
});

// ===========================================================================
// Authentication
// ===========================================================================
describe('GET /api/cron/contract-reminders — auth', () => {
  it('returns 401 when no auth header is provided', async () => {
    const res = await GET(makeRequest() as any);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 401 when Authorization header has wrong secret', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret') as any);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 401 when x-cron-secret header has wrong value', async () => {
    const res = await GET(makeRequest(undefined, 'wrong-secret') as any);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('accepts correct Authorization: Bearer test-secret', async () => {
    const res = await GET(makeRequest('Bearer test-secret') as any);
    expect(res.status).toBe(200);
  });

  it('accepts correct x-cron-secret: test-secret', async () => {
    const res = await GET(makeRequest(undefined, 'test-secret') as any);
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// Idempotency (cron lock)
// ===========================================================================
describe('GET /api/cron/contract-reminders — cron lock', () => {
  it('returns 200 { skipped: true } when acquireCronLock returns false', async () => {
    mocks.acquireCronLock.mockResolvedValue(false);
    const res = await GET(makeRequest('Bearer test-secret') as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe(true);
    expect(json.reason).toBe('already_run');
    // Must not query DB for clients
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Happy path — processing clients without contract
// ===========================================================================
describe('GET /api/cron/contract-reminders — processing', () => {
  it('sends email + SMS + notification for a client without contract', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([clientWithoutContract]);

    const res = await GET(makeRequest('Bearer test-secret') as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(json.skipped).toBe(0);
    expect(json.total).toBe(1);

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@x.com' }),
    );
    expect(mocks.sendSMS).toHaveBeenCalledWith(
      '+212600000001',
      expect.stringContaining('Alice'),
    );
    expect(mocks.prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'client-1',
          type: 'CONTRACT_REMINDER',
        }),
      }),
    );
  });

  it('skips SMS when client has no phone', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([clientWithoutPhone]);

    const res = await GET(makeRequest('Bearer test-secret') as any);
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'bob@x.com' }),
    );
    expect(mocks.sendSMS).not.toHaveBeenCalled();
    expect(mocks.prisma.notification.create).toHaveBeenCalled();
  });

  it('skips clients already reminded within 7 days', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([clientWithoutContract]);
    // Simulate a recent CONTRACT_REMINDER notification for this client
    mocks.prisma.notification.findMany.mockResolvedValue([
      { userId: 'client-1' },
    ]);

    const res = await GET(makeRequest('Bearer test-secret') as any);
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.skipped).toBe(1);
    expect(json.total).toBe(1);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.sendSMS).not.toHaveBeenCalled();
  });

  it('processes multiple clients independently', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([
      clientWithoutContract,
      clientWithoutPhone,
    ]);
    // client-1 was already reminded; client-2 was not
    mocks.prisma.notification.findMany.mockResolvedValue([
      { userId: 'client-1' },
    ]);

    const res = await GET(makeRequest('Bearer test-secret') as any);
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(json.skipped).toBe(1);
    expect(json.total).toBe(2);
    // Only client-2 email
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'bob@x.com' }),
    );
  });

  it('returns { sent, skipped, total } shape on success', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([clientWithoutContract]);

    const res = await GET(makeRequest('Bearer test-secret') as any);
    const json = await res.json();
    expect(json).toMatchObject({
      sent: expect.any(Number),
      skipped: expect.any(Number),
      total: expect.any(Number),
    });
  });
});
