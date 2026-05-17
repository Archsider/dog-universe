/**
 * API tests — POST /api/bookings/[id]/addon-request
 *
 * Surface tested:
 *   - Auth: CLIENT-only (admin gets 401)
 *   - IDOR: 404 if booking belongs to another client (no info leak)
 *   - State guard: BOOKING_NOT_ACTIVE on PENDING/COMPLETED/CANCELLED bookings
 *   - Per-booking cap: 3 requests max → 429 TOO_MANY_REQUESTS
 *   - Validation via withSchema: serviceType enum, message length
 *   - Notification fan-out to admins on success
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  bookingFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  addonRequestCount: vi.fn(),
  addonRequestCreate: vi.fn(),
  notifyAdmins: vi.fn(async () => undefined),
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    booking: { findFirst: mocks.bookingFindFirst },
    user: { findFirst: mocks.userFindFirst },
    addonRequest: { count: mocks.addonRequestCount, create: mocks.addonRequestCreate },
  },
}));

vi.mock('@/lib/notifications', () => ({
  notifyAdminsAddonRequest: mocks.notifyAdmins,
}));

import { POST } from '@/app/api/bookings/[id]/addon-request/route';

function req(body: unknown): Request {
  return new Request('http://localhost/api/bookings/b1/addon-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: 'b1' }) };

const baseBooking = {
  id: 'b1',
  clientId: 'client1',
  status: 'CONFIRMED',
  bookingPets: [{ pet: { name: 'Max' } }, { pet: { name: 'Luna' } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'client1', role: 'CLIENT' } });
  mocks.bookingFindFirst.mockResolvedValue(baseBooking);
  mocks.userFindFirst.mockResolvedValue({ name: 'Mehdi', email: 'm@x.com' });
  mocks.addonRequestCount.mockResolvedValue(0);
  mocks.addonRequestCreate.mockResolvedValue({ id: 'addon1' });
});

describe('POST addon-request — auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await POST(req({ serviceType: 'PET_TAXI' }) as never, ctx as never);
    expect(res.status).toBe(401);
  });

  it('rejects ADMIN with 403 (route is CLIENT-only)', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'a1', role: 'ADMIN' } });
    const res = await POST(req({ serviceType: 'PET_TAXI' }) as never, ctx as never);
    expect(res.status).toBe(403);
  });
});

describe('POST addon-request — IDOR safety', () => {
  it('returns 404 when booking belongs to another client (no info leak)', async () => {
    mocks.bookingFindFirst.mockResolvedValueOnce({ ...baseBooking, clientId: 'someone-else' });
    const res = await POST(req({ serviceType: 'PET_TAXI' }) as never, ctx as never);
    expect(res.status).toBe(404);
    expect(mocks.addonRequestCreate).not.toHaveBeenCalled();
  });

  it('returns 404 when booking does not exist', async () => {
    mocks.bookingFindFirst.mockResolvedValueOnce(null);
    const res = await POST(req({ serviceType: 'PET_TAXI' }) as never, ctx as never);
    expect(res.status).toBe(404);
  });
});

describe('POST addon-request — state guard', () => {
  it('rejects PENDING booking', async () => {
    mocks.bookingFindFirst.mockResolvedValueOnce({ ...baseBooking, status: 'PENDING' });
    const res = await POST(req({ serviceType: 'PET_TAXI' }) as never, ctx as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('BOOKING_NOT_ACTIVE');
  });

  it('rejects COMPLETED booking', async () => {
    mocks.bookingFindFirst.mockResolvedValueOnce({ ...baseBooking, status: 'COMPLETED' });
    const res = await POST(req({ serviceType: 'PET_TAXI' }) as never, ctx as never);
    expect(res.status).toBe(400);
  });

  it('rejects CANCELLED booking', async () => {
    mocks.bookingFindFirst.mockResolvedValueOnce({ ...baseBooking, status: 'CANCELLED' });
    const res = await POST(req({ serviceType: 'PET_TAXI' }) as never, ctx as never);
    expect(res.status).toBe(400);
  });

  it('accepts CONFIRMED', async () => {
    const res = await POST(req({ serviceType: 'PET_TAXI' }) as never, ctx as never);
    expect(res.status).toBe(201);
  });

  it('accepts IN_PROGRESS', async () => {
    mocks.bookingFindFirst.mockResolvedValueOnce({ ...baseBooking, status: 'IN_PROGRESS' });
    const res = await POST(req({ serviceType: 'PET_TAXI' }) as never, ctx as never);
    expect(res.status).toBe(201);
  });
});

describe('POST addon-request — per-booking rate limit', () => {
  it('allows up to 3 requests per booking', async () => {
    mocks.addonRequestCount.mockResolvedValueOnce(2);
    const res = await POST(req({ serviceType: 'TOILETTAGE' }) as never, ctx as never);
    expect(res.status).toBe(201);
  });

  it('rejects the 4th request with 429', async () => {
    mocks.addonRequestCount.mockResolvedValueOnce(3);
    const res = await POST(req({ serviceType: 'TOILETTAGE' }) as never, ctx as never);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('TOO_MANY_REQUESTS');
    expect(mocks.addonRequestCreate).not.toHaveBeenCalled();
  });
});

describe('POST addon-request — validation (withSchema)', () => {
  it('rejects unknown serviceType', async () => {
    const res = await POST(req({ serviceType: 'GROOMING' }) as never, ctx as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_ERROR');
  });

  it('rejects message > 500 chars', async () => {
    const longMsg = 'a'.repeat(501);
    const res = await POST(req({ serviceType: 'AUTRE', message: longMsg }) as never, ctx as never);
    expect(res.status).toBe(400);
  });

  it('accepts each of the 3 valid serviceTypes', async () => {
    for (const st of ['PET_TAXI', 'TOILETTAGE', 'AUTRE']) {
      mocks.addonRequestCount.mockResolvedValueOnce(0);
      mocks.bookingFindFirst.mockResolvedValueOnce(baseBooking);
      const res = await POST(req({ serviceType: st }) as never, ctx as never);
      expect(res.status).toBe(201);
    }
  });
});

describe('POST addon-request — happy path', () => {
  it('creates the AddonRequest row + notifies admins', async () => {
    const res = await POST(req({ serviceType: 'PET_TAXI', message: 'pickup 14h' }) as never, ctx as never);
    expect(res.status).toBe(201);
    expect(mocks.addonRequestCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: 'b1',
        serviceType: 'PET_TAXI',
        description: 'pickup 14h',
        requestedBy: 'client1',
        status: 'PENDING',
      }),
    });
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'b1',
        clientName: 'Mehdi',
        petNames: 'Max, Luna',
        serviceType: 'PET_TAXI',
        message: 'pickup 14h',
      }),
    );
  });

  it('uses email as fallback when client.name is missing', async () => {
    mocks.userFindFirst.mockResolvedValueOnce({ name: null, email: 'fallback@x.com' });
    await POST(req({ serviceType: 'AUTRE' }) as never, ctx as never);
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ clientName: 'fallback@x.com' }),
    );
  });

  it('uses "Client" as fallback when both name and email are missing', async () => {
    mocks.userFindFirst.mockResolvedValueOnce(null);
    await POST(req({ serviceType: 'AUTRE' }) as never, ctx as never);
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ clientName: 'Client' }),
    );
  });
});
