/**
 * Integration tests — PATCH /api/invoices/[id].
 *
 * Focus:
 *  - status whitelist enforcement (INVALID_STATUS)
 *  - cross-role authz: ADMIN cannot touch invoices whose client.role !== CLIENT,
 *    SUPERADMIN can.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    invoice: { findUnique: vi.fn(), update: vi.fn() },
    invoiceItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(async (fn: unknown) => (typeof fn === 'function' ? (fn as () => unknown)() : fn)),
  },
  allocatePayments: vi.fn().mockResolvedValue(undefined),
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/payments', () => ({ allocatePayments: mocks.allocatePayments }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { INVOICE_UPDATED: 'INVOICE_UPDATED', INVOICE_DELETED: 'INVOICE_DELETED' },
}));

import { PATCH } from '@/app/api/invoices/[id]/route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/invoices/inv-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: 'inv-1' }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  mocks.prisma.$transaction.mockImplementation(async (fn: unknown) =>
    typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(mocks.prisma) : fn,
  );
  mocks.allocatePayments.mockResolvedValue(undefined);
  mocks.logAction.mockResolvedValue(undefined);
  mocks.prisma.invoiceItem.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.invoiceItem.createMany.mockResolvedValue({ count: 1 });
  mocks.prisma.invoice.update.mockResolvedValue({ id: 'inv-1' });
});

describe('PATCH /api/invoices/[id] — status whitelist', () => {
  it('rejects an invalid status as INVALID_STATUS', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValue({
      id: 'inv-1',
      version: 1,
      notes: null,
      client: { role: 'CLIENT' },
    });
    const res = await PATCH(
      makeReq({
        items: [{ description: 'x', quantity: 1, unitPrice: 100 }],
        status: 'HACKED',
      }),
      params,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_STATUS');
  });

  it('accepts a CANCELLED status from the whitelist', async () => {
    mocks.prisma.invoice.findUnique
      .mockResolvedValueOnce({ id: 'inv-1', version: 1, notes: null, client: { role: 'CLIENT' } })
      .mockResolvedValueOnce({ id: 'inv-1', status: 'CANCELLED', client: { role: 'CLIENT' } });
    const res = await PATCH(
      makeReq({
        items: [{ description: 'x', quantity: 1, unitPrice: 100 }],
        status: 'CANCELLED',
      }),
      params,
    );
    expect(res.status).toBe(200);
    expect(mocks.allocatePayments).not.toHaveBeenCalled(); // cancelled → no allocation
  });
});

describe('PATCH /api/invoices/[id] — cross-role authz', () => {
  it('forbids ADMIN from touching invoices of non-CLIENT users (FORBIDDEN)', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      version: 1,
      notes: null,
      client: { role: 'SUPERADMIN' },
    });
    const res = await PATCH(makeReq({ notes: 'x' }), params);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('FORBIDDEN');
  });

  it('lets SUPERADMIN edit any invoice regardless of target client role', async () => {
    mocks.prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      version: 1,
      notes: null,
      client: { role: 'ADMIN' },
    });
    mocks.prisma.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'CANCELLED' });
    mocks.auth.mockResolvedValueOnce({ user: { id: 'su-1', role: 'SUPERADMIN' } });
    const res = await PATCH(makeReq({ status: 'CANCELLED' }), params);
    expect(res.status).toBe(200);
    expect(mocks.prisma.invoice.update).toHaveBeenCalled();
  });
});
