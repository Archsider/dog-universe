/**
 * Integration tests — POST /api/invoices (manual invoice creation).
 *
 * Focus: role gate (ADMIN/SUPERADMIN), body validation, and the inventory
 * decrement path on productId items. Mocks every collaborator — no real DB.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const prismaTx = {
    invoice: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    invoiceItem: { createMany: vi.fn() },
    product: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return {
    auth: vi.fn(),
    prisma: {
      ...prismaTx,
      user: { findFirst: vi.fn() },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (fn: unknown) => {
        if (typeof fn === 'function') return (fn as (tx: typeof prismaTx) => unknown)(prismaTx);
        return fn;
      }),
    },
    prismaTx,
    allocatePayments: vi.fn().mockResolvedValue(undefined),
    logAction: vi.fn().mockResolvedValue(undefined),
    tryAcquireIdempotency: vi.fn().mockResolvedValue({ acquired: true }),
    createInvoiceNotification: vi.fn().mockResolvedValue(undefined),
    sendEmailNow: vi.fn().mockResolvedValue(undefined),
    getEmailTemplate: vi.fn().mockReturnValue({ subject: 's', html: 'h' }),
    withSpan: vi.fn(async (_n: string, _a: unknown, fn: () => unknown) => fn()),
    logServerError: vi.fn(),
  };
});

vi.mock('../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/payments', () => ({ allocatePayments: mocks.allocatePayments }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { INVOICE_CREATED: 'INVOICE_CREATED', INVOICE_PAID: 'INVOICE_PAID' },
}));
vi.mock('@/lib/idempotency', () => ({
  tryAcquireIdempotency: mocks.tryAcquireIdempotency,
  IdempotencyKeyInvalidError: class IdempotencyKeyInvalidError extends Error {},
}));
vi.mock('@/lib/notifications', () => ({
  createInvoiceNotification: mocks.createInvoiceNotification,
}));
vi.mock('@/lib/email', () => ({ getEmailTemplate: mocks.getEmailTemplate }));
vi.mock('@/lib/notify-now', () => ({ sendEmailNow: mocks.sendEmailNow }));
vi.mock('@/lib/utils', () => ({ formatMAD: (n: number) => `${n} MAD` }));
vi.mock('@/lib/observability', () => ({
  withSpan: mocks.withSpan,
  logServerError: mocks.logServerError,
}));

import { POST as InvoicesPOST } from '@/app/api/invoices/route';

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/invoices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  mocks.tryAcquireIdempotency.mockResolvedValue({ acquired: true });
});

describe('POST /api/invoices — role gate', () => {
  it('rejects unauthenticated requests with 403', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await InvoicesPOST(makeReq({}));
    expect(res.status).toBe(403);
  });

  it('rejects CLIENT role with 403', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'c1', role: 'CLIENT' } });
    const res = await InvoicesPOST(makeReq({}));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/invoices — body validation', () => {
  it('rejects missing clientId/items with 400 MISSING_FIELDS', async () => {
    const res = await InvoicesPOST(makeReq({ notes: 'x' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('MISSING_FIELDS');
  });

  it('rejects invalid serviceType with 400 INVALID_SERVICE_TYPE', async () => {
    const res = await InvoicesPOST(
      makeReq({ clientId: 'c1', items: [{ description: 'x', quantity: 1, unitPrice: 10, total: 10 }], serviceType: 'BOGUS' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_SERVICE_TYPE');
  });

  it('rejects an item with negative unitPrice as INVALID_ITEM_PRICE', async () => {
    const res = await InvoicesPOST(
      makeReq({
        clientId: 'c1',
        items: [{ description: 'x', quantity: 1, unitPrice: -5, total: 0 }],
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_ITEM_PRICE');
  });
});
