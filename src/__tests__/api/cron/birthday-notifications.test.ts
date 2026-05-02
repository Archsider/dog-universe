/**
 * Unit tests — GET /api/cron/birthday-notifications
 *
 * Mocks: prisma, sendSMS, acquireCronLock
 * No real DB connection — all collaborators are stubbed via vi.mock().
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

process.env.CRON_SECRET = 'test-secret';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  return {
    prisma: {
      $queryRaw: vi.fn(),
      notification: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
    },
    enqueueSms: vi.fn().mockResolvedValue(undefined),
    acquireCronLock: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/queues', () => ({
  enqueueSms: mocks.enqueueSms,
  enqueueEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/sms', () => ({
  petPossessive: vi.fn().mockReturnValue('ses'),
  petVerb: vi.fn().mockReturnValue('est'),
  petCompanion: vi.fn().mockReturnValue('votre compagnon'),
  formatDateFR: (d: Date) => d.toISOString().slice(0, 10),
}));
vi.mock('@/lib/cron-lock', () => ({
  acquireCronLock: mocks.acquireCronLock,
}));

// Import handler AFTER mocks
import { GET } from '@/app/api/cron/birthday-notifications/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers['authorization'] = authHeader;
  return new Request('https://example.com/api/cron/birthday-notifications', { headers });
}

const today = new Date();
const petWithBirthday = {
  id: 'pet-001',
  name: 'Luna',
  species: 'DOG',
  ownerId: 'owner-1',
  dateOfBirth: new Date(today.getFullYear() - 3, today.getMonth(), today.getDate()),
  ownerName: 'Alice Dupont',
  ownerPhone: '+212600000001',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: lock acquired (cron proceeds)
  mocks.acquireCronLock.mockResolvedValue(true);
  // Default: no pets with birthdays
  mocks.prisma.$queryRaw.mockResolvedValue([]);
  // Default: no existing notifications today (batch dedup)
  mocks.prisma.notification.findMany.mockResolvedValue([]);
  mocks.prisma.notification.create.mockResolvedValue({ id: 'notif-1' });
});

// ===========================================================================
// Authentication
// ===========================================================================
describe('GET /api/cron/birthday-notifications — auth', () => {
  it('returns 401 when Authorization header is missing', async () => {
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

  it('accepts correct Authorization: Bearer test-secret', async () => {
    const res = await GET(makeRequest('Bearer test-secret') as any);
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// Idempotency (cron lock)
// ===========================================================================
describe('GET /api/cron/birthday-notifications — cron lock', () => {
  it('returns 200 { skipped: true } when acquireCronLock returns false', async () => {
    mocks.acquireCronLock.mockResolvedValue(false);
    const res = await GET(makeRequest('Bearer test-secret') as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe(true);
    expect(json.reason).toBe('already_run');
    // Must not query DB for pets
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// No birthdays
// ===========================================================================
describe('GET /api/cron/birthday-notifications — no birthdays', () => {
  it('returns { sent: 0 } when no pets have a birthday today', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    const res = await GET(makeRequest('Bearer test-secret') as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(mocks.enqueueSms).not.toHaveBeenCalled();
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Happy path — birthday processing
// ===========================================================================
describe('GET /api/cron/birthday-notifications — processing', () => {
  it('creates a PET_BIRTHDAY notification and sends SMS for a pet with birthday today', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([petWithBirthday]);

    const res = await GET(makeRequest('Bearer test-secret') as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(json.petIds).toContain('pet-001');

    // Notification created with correct data
    expect(mocks.prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'owner-1',
          type: 'PET_BIRTHDAY',
        }),
      }),
    );

    // SMS enqueued for owner
    expect(mocks.enqueueSms).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+212600000001', message: expect.stringContaining('Luna') }),
      expect.any(String),
    );
  });

  it('skips SMS when ownerPhone is null', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      { ...petWithBirthday, ownerPhone: null },
    ]);

    const res = await GET(makeRequest('Bearer test-secret') as any);
    const json = await res.json();
    expect(json.sent).toBe(1);
    // Notification created but no SMS enqueued
    expect(mocks.prisma.notification.create).toHaveBeenCalled();
    expect(mocks.enqueueSms).not.toHaveBeenCalled();
  });

  it('deduplicates: skips pet already notified today', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([petWithBirthday]);
    // Simulate: a PET_BIRTHDAY notification was already sent today for this pet
    mocks.prisma.notification.findMany.mockResolvedValue([
      { userId: 'owner-1', metadata: JSON.stringify({ petId: 'pet-001' }) },
    ]);

    const res = await GET(makeRequest('Bearer test-secret') as any);
    const json = await res.json();
    expect(json.sent).toBe(0);
    // Neither create nor SMS should be called
    expect(mocks.prisma.notification.create).not.toHaveBeenCalled();
    expect(mocks.enqueueSms).not.toHaveBeenCalled();
  });

  it('processes multiple pets, each with dedup check', async () => {
    const pet2 = {
      id: 'pet-002',
      name: 'Rex',
      species: 'DOG',
      ownerId: 'owner-2',
      dateOfBirth: new Date(today.getFullYear() - 5, today.getMonth(), today.getDate()),
      ownerName: 'Bob Martin',
      ownerPhone: '+212600000002',
    };
    mocks.prisma.$queryRaw.mockResolvedValue([petWithBirthday, pet2]);
    // Only pet-001 was already notified — batch findMany returns just that one
    mocks.prisma.notification.findMany.mockResolvedValue([
      { userId: 'owner-1', metadata: JSON.stringify({ petId: 'pet-001' }) },
    ]);

    const res = await GET(makeRequest('Bearer test-secret') as any);
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(json.petIds).toEqual(['pet-002']);
    expect(mocks.enqueueSms).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueSms).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+212600000002', message: expect.stringContaining('Rex') }),
      expect.any(String),
    );
  });

  it('returns { sent, petIds } on success', async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([petWithBirthday]);

    const res = await GET(makeRequest('Bearer test-secret') as any);
    const json = await res.json();
    expect(json).toMatchObject({
      sent: expect.any(Number),
      petIds: expect.any(Array),
    });
  });
});
