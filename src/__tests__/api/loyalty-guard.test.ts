/**
 * Unit tests — PUT /api/admin/clients/[id]/loyalty (Sprint 1 sécurité)
 *
 * Couvre le guard cible :
 *   - target null         → 404 CLIENT_NOT_FOUND
 *   - target.role !== CLIENT (ADMIN) → 404 CLIENT_NOT_FOUND
 *   - target.deletedAt !== null      → 404 CLIENT_NOT_FOUND
 *   - target valide       → 200 + upsert
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    loyaltyGrade: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  logAction: vi.fn().mockResolvedValue(undefined),
  invalidateLoyaltyCache: vi.fn().mockResolvedValue(undefined),
  createLoyaltyUpdateNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { LOYALTY_GRADE_OVERRIDE: 'LOYALTY_GRADE_OVERRIDE' },
}));
vi.mock('@/lib/notifications', () => ({
  createLoyaltyUpdateNotification: mocks.createLoyaltyUpdateNotification,
}));
vi.mock('@/lib/loyalty', () => ({ isUpgrade: () => false }));
vi.mock('@/lib/loyalty-server', () => ({
  invalidateLoyaltyCache: mocks.invalidateLoyaltyCache,
}));

import { PUT } from '@/app/api/admin/clients/[id]/loyalty/route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/clients/x/loyalty', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  mocks.prisma.loyaltyGrade.findUnique.mockResolvedValue(null);
  mocks.prisma.loyaltyGrade.upsert.mockResolvedValue({ id: 'g-1', grade: 'GOLD' });
});

describe('PUT /api/admin/clients/[id]/loyalty — guard cible', () => {
  it('returns 404 when target user does not exist', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce(null);
    const res = await PUT(makeRequest({ grade: 'GOLD' }), params('ghost'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('CLIENT_NOT_FOUND');
    expect(mocks.prisma.loyaltyGrade.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 when target is not a CLIENT (e.g. ADMIN)', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce({ role: 'ADMIN', deletedAt: null });
    const res = await PUT(makeRequest({ grade: 'GOLD' }), params('admin-2'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('CLIENT_NOT_FOUND');
    expect(mocks.prisma.loyaltyGrade.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 when target client is soft-deleted', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce({
      role: 'CLIENT',
      deletedAt: new Date(),
    });
    const res = await PUT(makeRequest({ grade: 'GOLD' }), params('deleted-client'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('CLIENT_NOT_FOUND');
    expect(mocks.prisma.loyaltyGrade.upsert).not.toHaveBeenCalled();
  });

  it('upserts grade when target is an active CLIENT', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce({ role: 'CLIENT', deletedAt: null });
    const res = await PUT(makeRequest({ grade: 'GOLD' }), params('client-1'));
    expect(res.status).toBe(200);
    expect(mocks.prisma.loyaltyGrade.upsert).toHaveBeenCalledOnce();
  });
});
