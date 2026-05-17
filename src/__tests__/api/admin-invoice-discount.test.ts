/**
 * API tests — POST/DELETE /api/admin/invoices/[id]/discount
 *
 * High-value tests because the route mutates Invoice.amount via the DB
 * trigger and a bad guard would let an admin discount past `paidAmount`,
 * which the DB CHECK rejects.
 *
 * Surface tested:
 *   - Auth: 401 for non-admin
 *   - Cross-role guard (H2): ADMIN can't discount a non-CLIENT invoice
 *   - Validation: type / value / PERCENT > 100
 *   - Business: discount > subtotal, amount < paidAmount, cancelled invoice
 *   - Atomicity: replace existing discount (deleteMany then create in tx)
 *   - DELETE: removes discount + audit log
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  invoiceFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  txDeleteMany: vi.fn(),
  txCreate: vi.fn(),
  topDeleteMany: vi.fn(),
  logAction: vi.fn(async () => undefined),
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    invoice: { findUnique: mocks.invoiceFindUnique },
    user: { findUnique: mocks.userFindUnique },
    invoiceItem: { deleteMany: mocks.topDeleteMany },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        invoiceItem: { deleteMany: mocks.txDeleteMany, create: mocks.txCreate },
      };
      return fn(tx);
    }),
  },
}));

vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { INVOICE_UPDATED: 'INVOICE_UPDATED' },
}));

vi.mock('@/lib/decimal', () => ({
  toNumber: (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)),
}));

vi.mock('@/lib/observability', () => ({
  withSpan: async <T>(_n: string, _a: unknown, fn: () => Promise<T>) => fn(),
}));

vi.mock('@prisma/client', () => ({
  Prisma: {
    Decimal: class { constructor(public v: number) {} toNumber() { return this.v; } },
  },
}));

import { POST, DELETE } from '@/app/api/admin/invoices/[id]/discount/route';

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/invoices/inv1/discount', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function delReq(): Request {
  return new Request('http://localhost/api/admin/invoices/inv1/discount', {
    method: 'DELETE',
  });
}

const ctx = { params: Promise.resolve({ id: 'inv1' }) };

const baseInvoice = {
  id: 'inv1',
  status: 'PENDING',
  paidAmount: 0,
  clientId: 'client1',
  items: [
    { id: 'i1', total: 600, category: 'BOARDING' },
    { id: 'i2', total: 400, category: 'TAXI' },
  ], // subtotal = 1000
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } });
  mocks.invoiceFindUnique.mockResolvedValue({ ...baseInvoice });
  mocks.userFindUnique.mockResolvedValue({ role: 'CLIENT' });
});

describe('POST discount — auth', () => {
  it('returns 401 when no session', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await POST(postReq({ type: 'AMOUNT', value: 100 }) as never, ctx);
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is CLIENT', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'c1', role: 'CLIENT' } });
    const res = await POST(postReq({ type: 'AMOUNT', value: 100 }) as never, ctx);
    expect(res.status).toBe(403);
  });

  it('SUPERADMIN bypasses the cross-role guard', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa', role: 'SUPERADMIN' } });
    mocks.userFindUnique.mockResolvedValueOnce({ role: 'ADMIN' });
    const res = await POST(postReq({ type: 'AMOUNT', value: 100 }) as never, ctx);
    expect(res.status).toBe(200);
  });

  it('ADMIN cannot discount a non-CLIENT invoice', async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ role: 'ADMIN' });
    const res = await POST(postReq({ type: 'AMOUNT', value: 100 }) as never, ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('FORBIDDEN');
  });
});

describe('POST discount — validation', () => {
  it('rejects unknown type', async () => {
    const res = await POST(postReq({ type: 'COUPON', value: 50 }) as never, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_ERROR');
  });

  it('rejects negative value', async () => {
    const res = await POST(postReq({ type: 'AMOUNT', value: -10 }) as never, ctx);
    expect(res.status).toBe(400);
  });

  it('rejects PERCENT > 100', async () => {
    const res = await POST(postReq({ type: 'PERCENT', value: 150 }) as never, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('PERCENT_OVER_100');
  });

  it('rejects invalid JSON body', async () => {
    const req = new Request('http://localhost/api/admin/invoices/inv1/discount', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await POST(req as never, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });
});

describe('POST discount — business invariants', () => {
  it('rejects discount > subtotal', async () => {
    const res = await POST(postReq({ type: 'AMOUNT', value: 5000 }) as never, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('DISCOUNT_EXCEEDS_SUBTOTAL');
    expect(body.subtotal).toBe(1000);
  });

  it('rejects discount that would push amount below paidAmount', async () => {
    mocks.invoiceFindUnique.mockResolvedValueOnce({ ...baseInvoice, paidAmount: 700 });
    // subtotal = 1000, paidAmount = 700, discount 400 → newAmount = 600 < 700 ❌
    const res = await POST(postReq({ type: 'AMOUNT', value: 400 }) as never, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('AMOUNT_BELOW_PAID');
  });

  it('rejects discount on CANCELLED invoice', async () => {
    mocks.invoiceFindUnique.mockResolvedValueOnce({ ...baseInvoice, status: 'CANCELLED' });
    const res = await POST(postReq({ type: 'AMOUNT', value: 100 }) as never, ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVOICE_CANCELLED');
  });

  it('returns 404 when invoice does not exist', async () => {
    mocks.invoiceFindUnique.mockResolvedValueOnce(null);
    const res = await POST(postReq({ type: 'AMOUNT', value: 100 }) as never, ctx);
    expect(res.status).toBe(404);
  });
});

describe('POST discount — happy path', () => {
  it('replaces any existing DISCOUNT then creates the new one (atomic)', async () => {
    const res = await POST(postReq({ type: 'AMOUNT', value: 200, reason: 'fidélité' }) as never, ctx);
    expect(res.status).toBe(200);
    // tx.deleteMany was called BEFORE create in the same tx
    expect(mocks.txDeleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 'inv1', category: 'DISCOUNT' },
    });
    expect(mocks.txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: 'inv1',
          description: 'Remise — fidélité',
          category: 'DISCOUNT',
        }),
      }),
    );
    const body = await res.json();
    expect(body.discount.computed).toBe(200);
    expect(body.newAmount).toBe(800);
  });

  it('PERCENT computes the correct amount on subtotal', async () => {
    const res = await POST(postReq({ type: 'PERCENT', value: 10 }) as never, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    // 10% of 1000 = 100
    expect(body.discount.computed).toBe(100);
    expect(body.newAmount).toBe(900);
  });

  it('writes an audit log entry', async () => {
    await POST(postReq({ type: 'AMOUNT', value: 50 }) as never, ctx);
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INVOICE_UPDATED',
        details: expect.objectContaining({ kind: 'DISCOUNT_APPLIED', computed: 50 }),
      }),
    );
  });
});

describe('DELETE discount', () => {
  it('rejects unauthenticated requests', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await DELETE(delReq() as never, ctx);
    expect(res.status).toBe(401);
  });

  it('cross-role guard blocks ADMIN on non-CLIENT invoice', async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ role: 'ADMIN' });
    const res = await DELETE(delReq() as never, ctx);
    expect(res.status).toBe(403);
  });

  it('returns 404 when invoice does not exist', async () => {
    mocks.invoiceFindUnique.mockResolvedValueOnce(null);
    const res = await DELETE(delReq() as never, ctx);
    expect(res.status).toBe(404);
  });

  it('removes the DISCOUNT line + writes audit log', async () => {
    mocks.topDeleteMany.mockResolvedValueOnce({ count: 1 });
    const res = await DELETE(delReq() as never, ctx);
    expect(res.status).toBe(200);
    expect(mocks.topDeleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 'inv1', category: 'DISCOUNT' },
    });
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ kind: 'DISCOUNT_REMOVED', removedCount: 1 }),
      }),
    );
  });
});
