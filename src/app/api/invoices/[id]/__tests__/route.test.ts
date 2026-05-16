/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
/**
 * Tests régression — Bug 1 + Bug 3 (PR hard-bugs-may17)
 *
 * Bug 1 — DELETE /api/invoices/[id] must refuse if paidAmount > 0,
 *         must invalidate revenue cache for periodDate Casa-month if
 *         paidAmount = 0 and status = PENDING.
 *
 * Bug 3 — PATCH /api/invoices/[id] must accept category='DISCOUNT'
 *         with negative unitPrice, and must reject category='DISCOUNT'
 *         with positive unitPrice (and any other category with
 *         negative unitPrice).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
vi.mock('../../../../../../auth', () => ({ auth: () => authMock() }));

const prismaMock: any = {
  invoice: {
    findUnique: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  invoiceItem: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  $transaction: vi.fn(async (fn: any) => fn(prismaMock)),
};
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

const cacheDelMock: any = vi.fn(async () => undefined);
vi.mock('@/lib/cache', () => ({
  cacheDel: (key: string) => cacheDelMock(key),
}));

const logActionMock: any = vi.fn(async () => undefined);
vi.mock('@/lib/log', () => ({
  logAction: (a: any) => logActionMock(a),
  LOG_ACTIONS: { INVOICE_DELETED: 'INVOICE_DELETED', INVOICE_UPDATED: 'INVOICE_UPDATED' },
}));

vi.mock('@/lib/payments', () => ({
  allocatePayments: vi.fn(async () => undefined),
}));

vi.mock('@/lib/billing-errors', () => ({
  isPaidExceedsCheckViolation: () => false,
  PAID_EXCEEDS_PAYLOAD: { error: 'PAID_EXCEEDS' },
}));

beforeEach(() => {
  authMock.mockReset();
  authMock.mockReturnValue({ user: { id: 'admin1', role: 'ADMIN' } });
  prismaMock.invoice.findUnique.mockReset();
  prismaMock.invoice.delete.mockReset();
  prismaMock.invoice.update.mockReset();
  prismaMock.invoiceItem.deleteMany.mockReset();
  prismaMock.invoiceItem.createMany.mockReset();
  cacheDelMock.mockReset();
  logActionMock.mockReset();
});

// ─── Bug 1 — DELETE handler ────────────────────────────────────────────

describe('DELETE /api/invoices/[id] — Sémantique B cancel-path enforcement', () => {
  async function callDelete(id = 'inv-1') {
    const req = new Request(`http://test/api/invoices/${id}`, { method: 'DELETE' });
    const mod = await import('../route');
    const res = await mod.DELETE(req as any, { params: Promise.resolve({ id }) });
    const body = res.status === 204 ? null : await res.json();
    return { status: res.status, body };
  }

  it('refuses DELETE if paidAmount > 0 (must use /cancel endpoint)', async () => {
    prismaMock.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1', status: 'PARTIALLY_PAID', paidAmount: 150, amount: 500,
      clientId: 'c1', periodDate: new Date('2026-05-15T08:00:00Z'),
      issuedAt: new Date('2026-05-15T08:00:00Z'),
      client: { role: 'CLIENT' },
    });

    const r = await callDelete();
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('INVOICE_HAS_PAYMENTS');
    expect(r.body.cancelEndpoint).toBe('/api/admin/invoices/inv-1/cancel');
    expect(prismaMock.invoice.delete).not.toHaveBeenCalled();
    // No cache invalidation when refused (nothing was actually mutated).
    expect(cacheDelMock).not.toHaveBeenCalled();
  });

  it('refuses DELETE if status is CANCELLED / PAID (only PENDING + paid=0 deletable)', async () => {
    prismaMock.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-2', status: 'CANCELLED', paidAmount: 0, amount: 500,
      clientId: 'c1', periodDate: new Date('2026-05-15T08:00:00Z'),
      issuedAt: new Date('2026-05-15T08:00:00Z'),
      client: { role: 'CLIENT' },
    });

    const r = await callDelete('inv-2');
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('INVOICE_NOT_DELETABLE');
    expect(prismaMock.invoice.delete).not.toHaveBeenCalled();
  });

  it('allows DELETE on PENDING + paidAmount=0 AND invalidates revenue cache for periodDate Casa-month', async () => {
    prismaMock.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-3', status: 'PENDING', paidAmount: 0, amount: 500,
      clientId: 'c1',
      // periodDate = 2026-04-30T23:00Z = 2026-05-01 00:00 Casa
      // => the cache key MUST be revenue:2026:5, NOT revenue:2026:4.
      periodDate: new Date('2026-04-30T23:00:00Z'),
      issuedAt: new Date('2026-04-30T23:00:00Z'),
      client: { role: 'CLIENT' },
    });
    prismaMock.invoice.delete.mockResolvedValueOnce({});

    const r = await callDelete('inv-3');
    expect(r.status).toBe(204);
    expect(prismaMock.invoice.delete).toHaveBeenCalledWith({ where: { id: 'inv-3' } });
    expect(cacheDelMock).toHaveBeenCalledWith('revenue:2026:5');
    expect(logActionMock).toHaveBeenCalled();
  });

  it('falls back to issuedAt when periodDate is null', async () => {
    prismaMock.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-4', status: 'PENDING', paidAmount: 0, amount: 100,
      clientId: 'c1',
      periodDate: null,
      issuedAt: new Date('2026-03-15T12:00:00Z'),
      client: { role: 'CLIENT' },
    });
    prismaMock.invoice.delete.mockResolvedValueOnce({});

    const r = await callDelete('inv-4');
    expect(r.status).toBe(204);
    expect(cacheDelMock).toHaveBeenCalledWith('revenue:2026:3');
  });

  it('returns 403 for ADMIN trying to delete a non-CLIENT-owned invoice', async () => {
    prismaMock.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-5', status: 'PENDING', paidAmount: 0,
      client: { role: 'ADMIN' },
    });
    const r = await callDelete('inv-5');
    expect(r.status).toBe(403);
    expect(prismaMock.invoice.delete).not.toHaveBeenCalled();
  });
});

// ─── Bug 3 — PATCH handler DISCOUNT category ───────────────────────────

describe('PATCH /api/invoices/[id] — DISCOUNT category support', () => {
  async function callPatch(id: string, body: any) {
    const req = new Request(`http://test/api/invoices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
    const mod = await import('../route');
    const res = await mod.PATCH(req as any, { params: Promise.resolve({ id }) });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  function setupOkInvoice() {
    prismaMock.invoice.findUnique
      .mockResolvedValueOnce({
        id: 'inv-x', status: 'PENDING', version: 1, notes: '',
        client: { role: 'CLIENT' },
      })
      // For the post-update fetch with FULL_INCLUDE
      .mockResolvedValueOnce({ id: 'inv-x' });
    prismaMock.invoiceItem.deleteMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.invoiceItem.createMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.invoice.update.mockResolvedValueOnce({ id: 'inv-x', version: 2 });
  }

  it('accepts DISCOUNT line with negative unitPrice (walk-in remise scenario)', async () => {
    setupOkInvoice();
    const r = await callPatch('inv-x', {
      items: [
        { description: 'Pension 5 nuits', quantity: 5, unitPrice: 120, category: 'BOARDING' },
        { description: 'Remise fidélité', quantity: 1, unitPrice: -100, category: 'DISCOUNT' },
      ],
    });
    // 200 (or whatever success status the route returns) — definitely NOT 400
    expect(r.status).not.toBe(400);
    expect(prismaMock.invoiceItem.createMany).toHaveBeenCalled();
  });

  it('rejects DISCOUNT line with positive unitPrice', async () => {
    prismaMock.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-x', status: 'PENDING', version: 1,
      client: { role: 'CLIENT' },
    });
    const r = await callPatch('inv-x', {
      items: [
        { description: 'Pension', quantity: 1, unitPrice: 120, category: 'BOARDING' },
        { description: 'Remise', quantity: 1, unitPrice: 50, category: 'DISCOUNT' },
      ],
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('DISCOUNT_REQUIRES_NEGATIVE_PRICE');
    expect(prismaMock.invoiceItem.createMany).not.toHaveBeenCalled();
  });

  it('rejects non-DISCOUNT line with negative unitPrice', async () => {
    prismaMock.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-x', status: 'PENDING', version: 1,
      client: { role: 'CLIENT' },
    });
    const r = await callPatch('inv-x', {
      items: [{ description: 'Bad', quantity: 1, unitPrice: -50, category: 'BOARDING' }],
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('INVALID_ITEM_PRICE');
  });

  it('keeps backward compatibility — items without category default to OTHER', async () => {
    setupOkInvoice();
    const r = await callPatch('inv-x', {
      items: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
    });
    expect(r.status).not.toBe(400);
  });
});
