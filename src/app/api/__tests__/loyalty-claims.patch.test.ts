/**
 * Integration tests — PATCH /api/admin/loyalty/claims/[id].
 *
 * Focus:
 *  - role gate (ADMIN/SUPERADMIN only)
 *  - APPROVED transition: notification created in tx + revalidateTag('admin-counts')
 *  - REJECTED requires rejectionReason (≥ 3 chars trimmed)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    loyaltyBenefitClaim: { update: vi.fn() },
    notification: { create: vi.fn() },
  };
  return {
    auth: vi.fn(),
    tx,
    prisma: {
      ...tx,
      $transaction: vi.fn(async (fn: unknown) =>
        typeof fn === 'function' ? (fn as (t: typeof tx) => unknown)(tx) : fn,
      ),
    },
    revalidateTag: vi.fn(),
    getEmailTemplate: vi.fn().mockReturnValue({ subject: 's', html: 'h' }),
    sendEmailNow: vi.fn(),
    invalidateNotifCount: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/email', () => ({ getEmailTemplate: mocks.getEmailTemplate }));
vi.mock('@/lib/notify-now', () => ({ sendEmailNow: mocks.sendEmailNow }));
vi.mock('@/lib/notifications', () => ({ invalidateNotifCount: mocks.invalidateNotifCount }));
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }));

import { PATCH } from '@/app/api/admin/loyalty/claims/[id]/route';
import { NextRequest } from 'next/server';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/loyalty/claims/c1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: 'c1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  mocks.tx.loyaltyBenefitClaim.update.mockResolvedValue({
    id: 'c1',
    clientId: 'client-1',
    benefitLabelFr: 'Toilettage offert',
    benefitLabelEn: 'Free grooming',
    client: { id: 'client-1', name: 'Foo', email: 'foo@x.com', language: 'fr' },
  });
});

describe('PATCH /api/admin/loyalty/claims/[id] — role gate', () => {
  it('rejects CLIENT with 401', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'c', role: 'CLIENT' } });
    const res = await PATCH(makeReq({ action: 'APPROVED' }), params);
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated with 401', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq({ action: 'APPROVED' }), params);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/admin/loyalty/claims/[id] — APPROVED', () => {
  it('creates notification in tx + revalidates admin-counts tag', async () => {
    const res = await PATCH(makeReq({ action: 'APPROVED' }), params);
    expect(res.status).toBe(200);
    expect(mocks.tx.loyaltyBenefitClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ status: 'APPROVED', rejectionReason: null }),
      }),
    );
    expect(mocks.tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'client-1',
          type: 'LOYALTY_UPDATE',
        }),
      }),
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith('admin-counts');
    expect(mocks.invalidateNotifCount).toHaveBeenCalledWith('client-1');
  });
});

describe('PATCH /api/admin/loyalty/claims/[id] — REJECTED', () => {
  it('rejects without rejectionReason → 400', async () => {
    const res = await PATCH(makeReq({ action: 'REJECTED' }), params);
    expect(res.status).toBe(400);
    expect(mocks.tx.loyaltyBenefitClaim.update).not.toHaveBeenCalled();
  });

  it('rejects with too-short rejectionReason → 400', async () => {
    const res = await PATCH(makeReq({ action: 'REJECTED', rejectionReason: 'ab' }), params);
    expect(res.status).toBe(400);
  });

  it('accepts a valid rejectionReason and writes it on the row', async () => {
    const res = await PATCH(
      makeReq({ action: 'REJECTED', rejectionReason: 'Stock épuisé pour le moment' }),
      params,
    );
    expect(res.status).toBe(200);
    expect(mocks.tx.loyaltyBenefitClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: 'Stock épuisé pour le moment',
        }),
      }),
    );
  });
});

describe('PATCH /api/admin/loyalty/claims/[id] — invalid action', () => {
  it('returns 400 on unknown action', async () => {
    const res = await PATCH(makeReq({ action: 'BOGUS' }), params);
    expect(res.status).toBe(400);
  });
});
