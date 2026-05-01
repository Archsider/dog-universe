/**
 * Unit tests — GET /api/cron/reminders
 *
 * Mocks: prisma, sendEmail, sendSMS, sendAdminSMS, createNotification, acquireCronLock
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
      user: { findMany: vi.fn() },
      booking: { findMany: vi.fn() },
      notification: { findMany: vi.fn() },
    },
    sendEmail: vi.fn().mockResolvedValue(undefined),
    getEmailTemplate: vi.fn().mockReturnValue({ subject: 'subj', html: '<p/>' }),
    sendSMS: vi.fn().mockResolvedValue(undefined),
    sendAdminSMS: vi.fn().mockResolvedValue(undefined),
    createNotification: vi.fn().mockResolvedValue(undefined),
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
  sendAdminSMS: mocks.sendAdminSMS,
  petPossessive: vi.fn().mockReturnValue('ses'),
  petVerb: vi.fn().mockReturnValue('sont'),
  petArrived: vi.fn().mockReturnValue('arrivés'),
  petChouchoute: vi.fn().mockReturnValue('chouchoutés'),
  petCompanion: vi.fn().mockReturnValue('votre compagnon'),
  formatDateFR: (d: Date) => d.toISOString().slice(0, 10),
}));
vi.mock('@/lib/notifications', () => ({
  createNotification: mocks.createNotification,
}));
vi.mock('@/lib/cron-lock', () => ({
  acquireCronLock: mocks.acquireCronLock,
}));

// Import handler AFTER mocks
import { GET } from '@/app/api/cron/reminders/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers['authorization'] = authHeader;
  return new Request('https://example.com/api/cron/reminders', { headers });
}

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(12, 0, 0, 0);

const bookingBase = {
  id: 'booking-001',
  clientId: 'client-1',
  startDate: tomorrow,
  endDate: new Date(tomorrow.getTime() + 3 * 24 * 3600 * 1000),
  client: { name: 'Alice Dupont', email: 'alice@x.com', language: 'fr', phone: '+212600000001' },
  bookingPets: [{ pet: { name: 'Max', gender: 'MALE' } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: lock acquired (cron proceeds)
  mocks.acquireCronLock.mockResolvedValue(true);
  // Default: no admins to notify
  mocks.prisma.user.findMany.mockResolvedValue([]);
  // Default: no start/end bookings
  mocks.prisma.booking.findMany.mockResolvedValue([]);
  // Default: no existing reminders today
  mocks.prisma.notification.findMany.mockResolvedValue([]);
});

// ===========================================================================
// Authentication
// ===========================================================================
describe('GET /api/cron/reminders — auth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 401 when Authorization header has wrong secret', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('accepts correct Authorization: Bearer test-secret', async () => {
    const res = await GET(makeRequest('Bearer test-secret'));
    // With no bookings, should return 200 ok
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// Idempotency (cron lock)
// ===========================================================================
describe('GET /api/cron/reminders — cron lock', () => {
  it('returns 200 { skipped: true } when acquireCronLock returns false', async () => {
    mocks.acquireCronLock.mockResolvedValue(false);
    const res = await GET(makeRequest('Bearer test-secret'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe(true);
    expect(json.reason).toBe('already_run');
    // Must not touch the DB for bookings
    expect(mocks.prisma.booking.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Start reminders (bookings starting tomorrow)
// ===========================================================================
describe('GET /api/cron/reminders — start reminders', () => {
  it('sends email + notification for a booking starting tomorrow', async () => {
    mocks.prisma.booking.findMany
      .mockResolvedValueOnce([bookingBase]) // startBookings
      .mockResolvedValueOnce([]);           // endBookings

    const res = await GET(makeRequest('Bearer test-secret'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.sent).toBe(1);
    expect(json.skipped).toBe(0);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alice@x.com' }),
    );
    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'client-1', type: 'STAY_REMINDER' }),
    );
    expect(mocks.sendSMS).toHaveBeenCalledWith(
      '+212600000001',
      expect.stringContaining('Max'),
    );
    expect(mocks.sendAdminSMS).toHaveBeenCalled();
  });

  it('skips bookings already notified today (dedup)', async () => {
    // Simulate: an existing STAY_REMINDER notification for this booking was sent today
    mocks.prisma.booking.findMany
      .mockResolvedValueOnce([bookingBase])
      .mockResolvedValueOnce([]);
    mocks.prisma.notification.findMany
      .mockResolvedValueOnce([
        { metadata: JSON.stringify({ bookingId: 'booking-001' }) },
      ])
      .mockResolvedValueOnce([]); // end dedup query

    const res = await GET(makeRequest('Bearer test-secret'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.skipped).toBe(1);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it('also sends admin notifications when admins are present', async () => {
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: 'admin-1', email: 'admin@x.com', language: 'fr' },
    ]);
    mocks.prisma.booking.findMany
      .mockResolvedValueOnce([bookingBase])
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest('Bearer test-secret'));
    expect(res.status).toBe(200);
    // Client email + admin email
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    // Client notification + admin notification
    expect(mocks.createNotification).toHaveBeenCalledTimes(2);
    // Admin notification has correct userId
    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-1', type: 'STAY_REMINDER' }),
    );
  });
});

// ===========================================================================
// End reminders (bookings ending tomorrow)
// ===========================================================================
describe('GET /api/cron/reminders — end reminders', () => {
  const endBooking = {
    ...bookingBase,
    id: 'booking-end-001',
    clientId: 'client-2',
    endDate: tomorrow,
    client: { name: 'Bob Martin', email: 'bob@x.com', language: 'fr', phone: '+212600000002' },
  };

  it('sends end reminder email + notification for a booking ending tomorrow', async () => {
    mocks.prisma.booking.findMany
      .mockResolvedValueOnce([])        // startBookings (none)
      .mockResolvedValueOnce([endBooking]); // endBookings

    const res = await GET(makeRequest('Bearer test-secret'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'bob@x.com' }),
    );
    expect(mocks.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'client-2', type: 'STAY_END_REMINDER' }),
    );
  });

  it('skips end booking already notified today (dedup)', async () => {
    mocks.prisma.booking.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([endBooking]);
    mocks.prisma.notification.findMany
      .mockResolvedValueOnce([]) // start dedup query
      .mockResolvedValueOnce([
        { metadata: JSON.stringify({ bookingId: 'booking-end-001' }) },
      ]); // end dedup query

    const res = await GET(makeRequest('Bearer test-secret'));
    const json = await res.json();
    expect(json.sent).toBe(0);
    expect(json.skipped).toBe(1);
  });
});

// ===========================================================================
// Response shape
// ===========================================================================
describe('GET /api/cron/reminders — response', () => {
  it('returns { ok, sent, skipped, startReminders, endReminders } on success', async () => {
    mocks.prisma.booking.findMany
      .mockResolvedValueOnce([bookingBase])
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest('Bearer test-secret'));
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      sent: expect.any(Number),
      skipped: expect.any(Number),
      startReminders: expect.any(Number),
      endReminders: expect.any(Number),
    });
  });
});
