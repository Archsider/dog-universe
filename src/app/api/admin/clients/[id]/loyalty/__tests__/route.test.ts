/**
 * Tests for PUT /api/admin/clients/[id]/loyalty (loyalty grade override).
 * Focus: auth gate, body validation, target validation, upsert isOverride=true,
 * notification on upgrade, audit log, cache invalidation.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    loyaltyGrade: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  logAction: vi.fn().mockResolvedValue(undefined),
  createLoyaltyUpdateNotification: vi.fn().mockResolvedValue(undefined),
  invalidateLoyaltyCache: vi.fn().mockResolvedValue(undefined),
  isUpgrade: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../../../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { LOYALTY_GRADE_OVERRIDE: 'LOYALTY_GRADE_OVERRIDE' },
}));
vi.mock('@/lib/notifications', () => ({
  createLoyaltyUpdateNotification: mocks.createLoyaltyUpdateNotification,
}));
vi.mock('@/lib/loyalty-server', () => ({
  invalidateLoyaltyCache: mocks.invalidateLoyaltyCache,
}));
vi.mock('@/lib/loyalty', () => ({
  isUpgrade: (...a: any[]) => mocks.isUpgrade(...a),
}));

import { PUT } from '@/app/api/admin/clients/[id]/loyalty/route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/admin/clients/abc/loyalty', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const adminSession = { user: { id: 'admin1', role: 'ADMIN' } };

describe('PUT /api/admin/clients/[id]/loyalty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isUpgrade.mockReturnValue(true);
    mocks.prisma.loyaltyGrade.upsert.mockResolvedValue({ id: 'lg1', grade: 'GOLD', isOverride: true });
  });

  it('401 without session', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await PUT(makeReq({ grade: 'GOLD' }), { params: Promise.resolve({ id: 'client1' }) });
    expect(res.status).toBe(401);
  });

  it('403 when role is CLIENT', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'c1', role: 'CLIENT' } });
    const res = await PUT(makeReq({ grade: 'GOLD' }), { params: Promise.resolve({ id: 'client1' }) });
    expect(res.status).toBe(403);
  });

  it('400 when body is invalid (missing grade)', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    const res = await PUT(makeReq({}), { params: Promise.resolve({ id: 'client1' }) });
    expect(res.status).toBe(400);
  });

  it('404 when target user not found', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    const res = await PUT(makeReq({ grade: 'GOLD' }), { params: Promise.resolve({ id: 'missing' }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'CLIENT_NOT_FOUND' });
  });

  it('404 when target is not a CLIENT (admin user)', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', deletedAt: null });
    const res = await PUT(makeReq({ grade: 'GOLD' }), { params: Promise.resolve({ id: 'admin2' }) });
    expect(res.status).toBe(404);
  });

  it('404 when target is soft-deleted', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT', deletedAt: new Date() });
    const res = await PUT(makeReq({ grade: 'GOLD' }), { params: Promise.resolve({ id: 'softdel' }) });
    expect(res.status).toBe(404);
  });

  it('happy path: upserts with isOverride=true + invalidates cache + writes audit log', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT', deletedAt: null });
    mocks.prisma.loyaltyGrade.findUnique.mockResolvedValue({ grade: 'SILVER' });

    const res = await PUT(makeReq({ grade: 'GOLD' }), { params: Promise.resolve({ id: 'client1' }) });
    expect(res.status).toBe(200);

    // upsert called with isOverride=true and overrideBy=session.user.id
    expect(mocks.prisma.loyaltyGrade.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mocks.prisma.loyaltyGrade.upsert.mock.calls[0]![0];
    expect(upsertArgs.where).toEqual({ clientId: 'client1' });
    expect(upsertArgs.update.isOverride).toBe(true);
    expect(upsertArgs.update.overrideBy).toBe('admin1');
    expect(upsertArgs.update.grade).toBe('GOLD');
    expect(upsertArgs.create.isOverride).toBe(true);
    expect(upsertArgs.create.clientId).toBe('client1');

    // Cache invalidated
    expect(mocks.invalidateLoyaltyCache).toHaveBeenCalledWith('client1');

    // Audit log written
    expect(mocks.logAction).toHaveBeenCalledTimes(1);
    const logArgs = mocks.logAction.mock.calls[0]![0];
    expect(logArgs.action).toBe('LOYALTY_GRADE_OVERRIDE');
    expect(logArgs.entityType).toBe('User');
    expect(logArgs.entityId).toBe('client1');
    expect(logArgs.details.newGrade).toBe('GOLD');
    expect(logArgs.details.previousGrade).toBe('SILVER');
    expect(logArgs.details.override).toBe(true);
  });

  it('notifies client on upgrade', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT', deletedAt: null });
    mocks.prisma.loyaltyGrade.findUnique.mockResolvedValue({ grade: 'BRONZE' });
    mocks.isUpgrade.mockReturnValue(true);

    await PUT(makeReq({ grade: 'GOLD' }), { params: Promise.resolve({ id: 'client1' }) });
    expect(mocks.createLoyaltyUpdateNotification).toHaveBeenCalledWith('client1', 'GOLD');
  });

  it('does not notify if downgrade', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT', deletedAt: null });
    mocks.prisma.loyaltyGrade.findUnique.mockResolvedValue({ grade: 'GOLD' });
    mocks.isUpgrade.mockReturnValue(false);

    await PUT(makeReq({ grade: 'BRONZE' }), { params: Promise.resolve({ id: 'client1' }) });
    expect(mocks.createLoyaltyUpdateNotification).not.toHaveBeenCalled();
  });

  it('notifies when no previous grade exists (new bucket)', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT', deletedAt: null });
    mocks.prisma.loyaltyGrade.findUnique.mockResolvedValue(null);

    await PUT(makeReq({ grade: 'BRONZE' }), { params: Promise.resolve({ id: 'client1' }) });
    expect(mocks.createLoyaltyUpdateNotification).toHaveBeenCalled();
  });

  it('SUPERADMIN can override too', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'super1', role: 'SUPERADMIN' } });
    mocks.prisma.user.findUnique.mockResolvedValue({ role: 'CLIENT', deletedAt: null });
    mocks.prisma.loyaltyGrade.findUnique.mockResolvedValue({ grade: 'BRONZE' });

    const res = await PUT(makeReq({ grade: 'PLATINUM' }), { params: Promise.resolve({ id: 'client1' }) });
    expect(res.status).toBe(200);
  });
});
