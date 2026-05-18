/**
 * Tests for POST /api/user/anonymize (RGPD self-anonymization).
 * Focus: auth gate, password confirmation, blocking active bookings,
 * idempotency on already-anonymized account, audit log written.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  bcryptCompare: vi.fn(),
  bcryptHash: vi.fn().mockResolvedValue('hashed-anon'),
  prisma: {
    user: { findUnique: vi.fn() },
    booking: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: any) => {
      const tx = {
        user: { update: vi.fn().mockResolvedValue({}) },
        pet: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        notification: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        passwordResetToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        clientContract: { update: vi.fn().mockResolvedValue({}) },
        actionLog: {
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return cb(tx);
    }),
  },
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/log', () => ({ logAction: mocks.logAction }));
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('bcryptjs', () => ({
  default: {
    compare: (...a: any[]) => mocks.bcryptCompare(...a),
    hash: (...a: any[]) => mocks.bcryptHash(...a),
  },
  compare: (...a: any[]) => mocks.bcryptCompare(...a),
  hash: (...a: any[]) => mocks.bcryptHash(...a),
}));

import { POST } from '@/app/api/user/anonymize/route';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/user/anonymize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const clientSession = { user: { id: 'client1', role: 'CLIENT' } };

const baseUserRow = {
  id: 'client1',
  role: 'CLIENT' as const,
  anonymizedAt: null,
  passwordHash: 'hash',
  email: 'old@example.com',
  phone: '+212600000000',
  name: 'Old Name',
  contract: null,
};

describe('POST /api/user/anonymize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bcryptCompare.mockResolvedValue(true);
    mocks.prisma.booking.findFirst.mockResolvedValue(null);
  });

  it('401 without session', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(makeReq({ password: 'pw' }));
    expect(res.status).toBe(401);
  });

  it('404 when target user not found', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ password: 'pw' }));
    expect(res.status).toBe(404);
  });

  it('400 when password missing on self-anonymize', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.user.findUnique.mockResolvedValue(baseUserRow);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'PASSWORD_REQUIRED' });
  });

  it('400 when password is wrong', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.user.findUnique.mockResolvedValue(baseUserRow);
    mocks.bcryptCompare.mockResolvedValue(false);

    const res = await POST(makeReq({ password: 'bad' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVALID_PASSWORD' });
  });

  it('400 when target role is not CLIENT', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } });
    mocks.prisma.user.findUnique.mockResolvedValue({ ...baseUserRow, role: 'ADMIN' });

    const res = await POST(makeReq({ password: 'pw' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'NOT_A_CLIENT' });
  });

  it('400 when active booking exists (blocking status)', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.user.findUnique.mockResolvedValue(baseUserRow);
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b1',
      status: 'CONFIRMED',
      startDate: new Date('2026-06-01'),
    });

    const res = await POST(makeReq({ password: 'pw' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('ACTIVE_BOOKING_EXISTS');
    expect(json.bookingId).toBe('b1');
  });

  it('idempotent: returns 200 alreadyAnonymized=true on already-anonymized user', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.user.findUnique.mockResolvedValue({
      ...baseUserRow,
      anonymizedAt: new Date(),
    });

    const res = await POST(makeReq({ password: 'pw' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, alreadyAnonymized: true });

    // Should not run transaction
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('happy path: anonymizes user + writes audit log', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.user.findUnique.mockResolvedValue(baseUserRow);

    const res = await POST(makeReq({ password: 'pw' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RGPD_ANONYMIZE',
        entityType: 'User',
        entityId: 'client1',
        details: { selfAnonymize: true },
      }),
    );
  });

  it('admin flow: SUPERADMIN can anonymize another user without password', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'super1', role: 'SUPERADMIN' } });
    mocks.prisma.user.findUnique.mockResolvedValue({ ...baseUserRow, id: 'client1' });

    const res = await POST(makeReq({ userId: 'client1' }));
    expect(res.status).toBe(200);

    // bcrypt should not be checked in admin flow
    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
  });

  it('admin flow: ADMIN (not SUPERADMIN) cannot anonymize another user', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } });

    const res = await POST(makeReq({ userId: 'client1' }));
    expect(res.status).toBe(403);
  });

  it('500 when transaction fails', async () => {
    mocks.auth.mockResolvedValue(clientSession);
    mocks.prisma.user.findUnique.mockResolvedValue(baseUserRow);
    mocks.prisma.$transaction.mockRejectedValueOnce(new Error('db boom'));

    const res = await POST(makeReq({ password: 'pw' }));
    expect(res.status).toBe(500);
  });
});
