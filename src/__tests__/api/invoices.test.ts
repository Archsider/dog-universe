/**
 * API tests — PATCH /api/invoices/[id]
 *
 * Focus: optimistic concurrency (VERSION_CONFLICT) + version increment on
 * successful PATCH. Mocks every collaborator (auth, prisma, payments, log).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prismaTx = {
    invoice: { update: vi.fn(), findUnique: vi.fn() },
    invoiceItem: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  };
  return {
    auth: vi.fn(),
    prisma: {
      ...prismaTx,
      $transaction: vi.fn(async (fn: any) => {
        if (typeof fn === 'function') return fn(prismaTx);
        return fn;
      }),
    },
    prismaTx,
    allocatePayments: vi.fn().mockResolvedValue(undefined),
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/payments', () => ({ allocatePayments: mocks.allocatePayments }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: {
    INVOICE_UPDATED: 'INVOICE_UPDATED',
    INVOICE_DELETED: 'INVOICE_DELETED',
  },
}));

import { PATCH as InvoicePATCH } from '@/app/api/invoices/[id]/route';

function makeReq(id: string, body: unknown): Request {
  return new Request(`https://example.com/api/invoices/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  mocks.prisma.$transaction.mockImplementation(async (fn: any) => {
    if (typeof fn === 'function') return fn(mocks.prismaTx);
    return fn;
  });
});

describe('Optimistic lock — invoices PATCH', () => {
  it('returns 409 VERSION_CONFLICT when client sends stale version', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv1',
      status: 'PENDING',
      version: 4,
      client: { role: 'CLIENT' },
    });

    const res = await InvoicePATCH(makeReq('inv1', { notes: 'updated', version: 1 }), paramsFor('inv1'));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('VERSION_CONFLICT');
    expect(json.currentVersion).toBe(4);
    expect(mocks.prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('increments version on successful legacy PATCH (notes only)', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv2',
      status: 'PENDING',
      version: 7,
      client: { role: 'CLIENT' },
      notes: null,
    });
    mocks.prisma.invoice.update.mockResolvedValue({ id: 'inv2', version: 8 });

    const res = await InvoicePATCH(makeReq('inv2', { notes: 'note', version: 7 }), paramsFor('inv2'));
    expect(res.status).toBe(200);
    expect(mocks.prisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'inv2' },
      data: expect.objectContaining({ version: { increment: 1 } }),
    }));
  });

  it('increments version on successful full PATCH (items array)', async () => {
    mocks.prisma.invoice.findUnique
      .mockResolvedValueOnce({
        id: 'inv3',
        status: 'PENDING',
        version: 2,
        client: { role: 'CLIENT' },
        notes: null,
      })
      // Final read after the tx (FULL_INCLUDE)
      .mockResolvedValueOnce({ id: 'inv3', version: 3, items: [], payments: [] });

    const body = {
      version: 2,
      items: [{ description: 'Pension', quantity: 4, unitPrice: 200, category: 'BOARDING' }],
    };
    const res = await InvoicePATCH(makeReq('inv3', body), paramsFor('inv3'));
    expect(res.status).toBe(200);
    expect(mocks.prismaTx.invoice.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'inv3' },
      data: expect.objectContaining({ version: { increment: 1 } }),
    }));
  });
});
