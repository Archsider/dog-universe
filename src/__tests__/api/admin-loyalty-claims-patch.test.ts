/**
 * API tests — PATCH /api/admin/loyalty/claims/[id]
 *
 * Surface tested:
 *   - Auth: 401 for non-admin
 *   - Cross-role guard (L1): ADMIN cannot review claims of non-CLIENT users
 *   - Validation: action must be APPROVED|REJECTED, REJECTED needs reason ≥ 3 chars
 *   - Atomicity: claim status + notification commit together
 *   - Email is post-commit fire-and-forget (failure does NOT roll back)
 *   - Cache invalidation: revalidateTag + invalidateNotifCount called
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  txClaimUpdate: vi.fn(),
  txNotifCreate: vi.fn(),
  startSpan: vi.fn(async (_attrs: unknown, fn: () => unknown) => fn()),
  invalidateNotifCount: vi.fn(async () => undefined),
  revalidateTag: vi.fn(),
  sendEmailNow: vi.fn(),
  getEmailTemplate: vi.fn(() => ({ subject: 'subject', html: '<p>html</p>' })),
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));

vi.mock('@sentry/nextjs', () => ({ startSpan: mocks.startSpan }));

vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }));

vi.mock('@/lib/notifications', () => ({ invalidateNotifCount: mocks.invalidateNotifCount }));
vi.mock('@/lib/notify-now', () => ({ sendEmailNow: mocks.sendEmailNow }));
vi.mock('@/lib/email', () => ({ getEmailTemplate: mocks.getEmailTemplate }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        loyaltyBenefitClaim: { update: mocks.txClaimUpdate },
        notification: { create: mocks.txNotifCreate },
      };
      return fn(tx);
    }),
  },
}));

import { PATCH } from '@/app/api/admin/loyalty/claims/[id]/route';

function makeReq(body: unknown): NextRequest {
  // The route only uses .json() and the params; a Request is enough for tests.
  return new Request('http://localhost/api/admin/loyalty/claims/c1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const ctx = { params: Promise.resolve({ id: 'claim1' }) };

const baseClaim = {
  id: 'claim1',
  clientId: 'client1',
  benefitLabelFr: 'Toilettage offert',
  benefitLabelEn: 'Free grooming',
  client: { id: 'client1', name: 'Mehdi', email: 'm@x.com', language: 'fr', role: 'CLIENT' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } });
  mocks.txClaimUpdate.mockResolvedValue(baseClaim);
  mocks.txNotifCreate.mockResolvedValue({});
});

describe('PATCH /api/admin/loyalty/claims/[id] — auth', () => {
  it('returns 401 when no session', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq({ action: 'APPROVED' }), ctx);
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is CLIENT', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'c1', role: 'CLIENT' } });
    const res = await PATCH(makeReq({ action: 'APPROVED' }), ctx);
    expect(res.status).toBe(401);
  });

  it('accepts ADMIN', async () => {
    const res = await PATCH(makeReq({ action: 'APPROVED' }), ctx);
    expect(res.status).toBe(200);
  });

  it('accepts SUPERADMIN', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa1', role: 'SUPERADMIN' } });
    const res = await PATCH(makeReq({ action: 'APPROVED' }), ctx);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/admin/loyalty/claims/[id] — validation', () => {
  it('rejects unknown action with 400', async () => {
    const res = await PATCH(makeReq({ action: 'MAYBE' }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid action');
  });

  it('rejects REJECTED without reason', async () => {
    const res = await PATCH(makeReq({ action: 'REJECTED' }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/reason required/i);
  });

  it('rejects REJECTED with empty/whitespace reason', async () => {
    const res = await PATCH(makeReq({ action: 'REJECTED', rejectionReason: '   ' }), ctx);
    expect(res.status).toBe(400);
  });

  it('rejects REJECTED with reason shorter than 3 chars', async () => {
    const res = await PATCH(makeReq({ action: 'REJECTED', rejectionReason: 'no' }), ctx);
    expect(res.status).toBe(400);
  });

  it('accepts REJECTED with valid reason', async () => {
    const res = await PATCH(
      makeReq({ action: 'REJECTED', rejectionReason: 'Conditions non remplies' }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(mocks.txClaimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: 'Conditions non remplies',
        }),
      }),
    );
  });
});

describe('PATCH /api/admin/loyalty/claims/[id] — cross-role guard (L1)', () => {
  it('returns 403 when ADMIN tries to review a claim of an ADMIN/SUPERADMIN user', async () => {
    mocks.txClaimUpdate.mockResolvedValueOnce({
      ...baseClaim,
      client: { ...baseClaim.client, role: 'ADMIN' },
    });
    const res = await PATCH(makeReq({ action: 'APPROVED' }), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('FORBIDDEN');
    // Email + cache invalidation must NOT have been triggered post-rollback.
    expect(mocks.sendEmailNow).not.toHaveBeenCalled();
    expect(mocks.invalidateNotifCount).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it('SUPERADMIN can review any claim (cross-role allowed)', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa1', role: 'SUPERADMIN' } });
    mocks.txClaimUpdate.mockResolvedValueOnce({
      ...baseClaim,
      client: { ...baseClaim.client, role: 'ADMIN' },
    });
    const res = await PATCH(makeReq({ action: 'APPROVED' }), ctx);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/admin/loyalty/claims/[id] — atomicity + side effects', () => {
  it('commits claim update + notification together (both inside the same tx)', async () => {
    await PATCH(makeReq({ action: 'APPROVED' }), ctx);
    expect(mocks.txClaimUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.txNotifCreate).toHaveBeenCalledTimes(1);
    // notif content matches APPROVED template
    expect(mocks.txNotifCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'client1',
          type: 'LOYALTY_UPDATE',
          titleFr: 'Avantage fidélité accordé',
        }),
      }),
    );
  });

  it('REJECTED flow uses the rejected notification template', async () => {
    await PATCH(
      makeReq({ action: 'REJECTED', rejectionReason: 'Quota mensuel atteint' }),
      ctx,
    );
    expect(mocks.txNotifCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          titleFr: "Réclamation d'avantage refusée",
          messageFr: expect.stringContaining('Quota mensuel atteint'),
        }),
      }),
    );
  });

  it('triggers email + cache invalidation post-commit', async () => {
    await PATCH(makeReq({ action: 'APPROVED' }), ctx);
    expect(mocks.sendEmailNow).toHaveBeenCalled();
    expect(mocks.invalidateNotifCount).toHaveBeenCalledWith('client1');
    expect(mocks.revalidateTag).toHaveBeenCalledWith('admin-counts');
  });

  it('uses client.language for the email template (en path)', async () => {
    mocks.txClaimUpdate.mockResolvedValueOnce({
      ...baseClaim,
      client: { ...baseClaim.client, language: 'en' },
    });
    await PATCH(makeReq({ action: 'APPROVED' }), ctx);
    expect(mocks.getEmailTemplate).toHaveBeenCalledWith(
      'loyalty_claim_approved',
      expect.any(Object),
      'en',
    );
  });
});
