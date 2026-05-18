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
    sendSmsNow: vi.fn(),
    cacheDel: vi.fn().mockResolvedValue(undefined),
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
vi.mock('@/lib/notify-now', () => ({
  sendEmailNow: mocks.sendEmailNow,
  sendSmsNow: mocks.sendSmsNow,
}));
vi.mock('@/lib/cache', () => ({ cacheDel: mocks.cacheDel }));
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
  it('rejects unauthenticated requests with 401', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await InvoicesPOST(makeReq({}));
    expect(res.status).toBe(401);
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

// ─── Golden-master: markPaid branch (Module 4-A, 2026-05-15) ────────────
// These tests lock down the "create invoice + record payment in one shot"
// path BEFORE the extraction of `recordPayment`. Site B is the walk-in
// workflow shortcut. After Module 4-A's refactor, every assertion must
// still pass — same contract as the Site A golden-master tests.

function setupHappyInvoiceCreate(clientOverrides: Record<string, unknown> = {}) {
  // Standard non-walkin client unless overridden.
  mocks.prisma.user.findFirst.mockResolvedValue({
    id: 'c1',
    name: 'Foo',
    email: 'f@x.com',
    isWalkIn: false,
    language: 'fr',
    deletedAt: null,
    role: 'CLIENT',
    ...clientOverrides,
  });
  // No collision on the generated invoice number.
  mocks.prisma.invoice.findUnique.mockResolvedValue(null);
  // The atomic seq INSERT returns one row.
  mocks.prisma.$queryRaw.mockResolvedValue([{ lastSeq: 1 }]);
  // The transaction's tx.invoice.create returns a minimal invoice shape.
  mocks.prismaTx.invoice.create.mockResolvedValue({
    id: 'inv-99',
    items: [{ id: 'it-1' }],
    client: { id: 'c1', email: 'f@x.com', name: 'Foo', isWalkIn: false, language: 'fr' },
  });
  mocks.prismaTx.payment.create.mockResolvedValue({ id: 'pay-99' });
  mocks.prisma.payment.create.mockResolvedValue({ id: 'pay-99' });
}

const validItems = [
  { description: 'Pension', quantity: 1, unitPrice: 500, total: 500, category: 'BOARDING' },
];

describe('POST /api/invoices — markPaid branch (Site B)', () => {
  beforeEach(() => {
    setupHappyInvoiceCreate();
  });

  it('creates a Payment row when markPaid=true + paymentMethod=CASH', async () => {
    const res = await InvoicesPOST(
      makeReq({
        clientId: 'c1',
        items: validItems,
        markPaid: true,
        paymentMethod: 'CASH',
      }),
    );
    expect(res.status).toBe(201);
    expect(mocks.prisma.payment.create).toHaveBeenCalledTimes(1);
    const call = mocks.prisma.payment.create.mock.calls[0][0];
    expect(call.data).toMatchObject({
      invoiceId: 'inv-99',
      amount: 500,
      paymentMethod: 'CASH',
    });
    expect(call.data.paymentDate).toBeInstanceOf(Date);
  });

  it('uses the provided paidAt when supplied', async () => {
    const paidAt = '2026-05-06T10:00:00Z';
    await InvoicesPOST(
      makeReq({
        clientId: 'c1',
        items: validItems,
        markPaid: true,
        paymentMethod: 'CARD',
        paidAt,
      }),
    );
    const call = mocks.prisma.payment.create.mock.calls[0][0];
    expect((call.data.paymentDate as Date).toISOString()).toBe('2026-05-06T10:00:00.000Z');
  });

  it('calls allocatePayments after creating the Payment row', async () => {
    await InvoicesPOST(
      makeReq({
        clientId: 'c1',
        items: validItems,
        markPaid: true,
        paymentMethod: 'CASH',
      }),
    );
    expect(mocks.allocatePayments).toHaveBeenCalledWith('inv-99');
  });

  it('does NOT create a Payment when markPaid is omitted (default = not paid)', async () => {
    await InvoicesPOST(
      makeReq({ clientId: 'c1', items: validItems }),
    );
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
    expect(mocks.allocatePayments).not.toHaveBeenCalled();
  });

  it('does NOT create a Payment when markPaid=true but paymentMethod is missing', async () => {
    // Defensive: the route requires BOTH flags. A markPaid without a method
    // is ignored rather than defaulted to CASH.
    await InvoicesPOST(
      makeReq({ clientId: 'c1', items: validItems, markPaid: true }),
    );
    expect(mocks.prisma.payment.create).not.toHaveBeenCalled();
  });

  it('sends invoice notification + email for non-walk-in clients', async () => {
    await InvoicesPOST(
      makeReq({
        clientId: 'c1',
        items: validItems,
        markPaid: true,
        paymentMethod: 'CASH',
      }),
    );
    expect(mocks.createInvoiceNotification).toHaveBeenCalled();
    expect(mocks.sendEmailNow).toHaveBeenCalled();
  });

  it('skips notification + email for walk-in clients', async () => {
    setupHappyInvoiceCreate({ isWalkIn: true });
    await InvoicesPOST(
      makeReq({
        clientId: 'c1',
        items: validItems,
        markPaid: true,
        paymentMethod: 'CASH',
      }),
    );
    expect(mocks.createInvoiceNotification).not.toHaveBeenCalled();
    expect(mocks.sendEmailNow).not.toHaveBeenCalled();
  });
});

// ─── Module 4-A divergences fixed in this PR ────────────────────────────
// Site B (invoice creation) was missing four behaviours that Site A
// (POST /api/invoices/[id]/payments) enforced. After the recordPayment
// extraction these now run automatically — these tests pin them down so
// future drift is caught at the test boundary.

describe('POST /api/invoices — markPaid Site B divergences (Module 4-A)', () => {
  it('rejects an unknown paymentMethod with 400 INVALID_PAYMENT_METHOD', async () => {
    setupHappyInvoiceCreate();
    const res = await InvoicesPOST(
      makeReq({
        clientId: 'c1',
        items: validItems,
        markPaid: true,
        paymentMethod: 'BITCOIN',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_PAYMENT_METHOD');
  });

  it('invalidates the revenue cache for the paymentDate month', async () => {
    setupHappyInvoiceCreate();
    await InvoicesPOST(
      makeReq({
        clientId: 'c1',
        items: validItems,
        markPaid: true,
        paymentMethod: 'CASH',
        paidAt: '2026-05-06T10:00:00Z',
      }),
    );
    expect(mocks.cacheDel).toHaveBeenCalledWith('revenue:2026:5');
  });

  it('falls back to current month for cache key when paidAt is omitted', async () => {
    setupHappyInvoiceCreate();
    await InvoicesPOST(
      makeReq({
        clientId: 'c1',
        items: validItems,
        markPaid: true,
        paymentMethod: 'CASH',
      }),
    );
    const now = new Date();
    const key = `revenue:${now.getFullYear()}:${now.getMonth() + 1}`;
    expect(mocks.cacheDel).toHaveBeenCalledWith(key);
  });

  it('dispatches admin SMS OPS via sendSmsNow with to=ADMIN', async () => {
    setupHappyInvoiceCreate();
    await InvoicesPOST(
      makeReq({
        clientId: 'c1',
        items: validItems,
        markPaid: true,
        paymentMethod: 'CASH',
      }),
    );
    expect(mocks.sendSmsNow).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ADMIN',
        message: expect.stringContaining('Paiement'),
      }),
    );
  });

  it('does NOT dispatch admin SMS when markPaid is false', async () => {
    setupHappyInvoiceCreate();
    await InvoicesPOST(
      makeReq({ clientId: 'c1', items: validItems }),
    );
    expect(mocks.sendSmsNow).not.toHaveBeenCalled();
  });

  it('does NOT send a client COMPTA SMS (Q1: avoid double-notify with invoice_available)', async () => {
    setupHappyInvoiceCreate();
    await InvoicesPOST(
      makeReq({
        clientId: 'c1',
        items: validItems,
        markPaid: true,
        paymentMethod: 'CASH',
      }),
    );
    // No sendSmsRespectful equivalent — Site B never sends a confirmation
    // SMS to the client. Only the admin OPS SMS (via sendSmsNow → to=ADMIN).
    const calls = mocks.sendSmsNow.mock.calls;
    expect(calls.every((c: unknown[]) => (c[0] as { to: string }).to === 'ADMIN')).toBe(true);
  });
});

describe('POST /api/invoices — cross-role gate (Module 4-A)', () => {
  it('blocks ADMIN from creating an invoice for a non-CLIENT user (403 FORBIDDEN)', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'admin-1', role: 'ADMIN' } });
    setupHappyInvoiceCreate({ role: 'ADMIN' });
    const res = await InvoicesPOST(
      makeReq({ clientId: 'c1', items: validItems }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('FORBIDDEN');
  });

  it('SUPERADMIN can create an invoice for any user role', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa-1', role: 'SUPERADMIN' } });
    setupHappyInvoiceCreate({ role: 'SUPERADMIN' });
    const res = await InvoicesPOST(
      makeReq({ clientId: 'c1', items: validItems }),
    );
    expect(res.status).toBe(201);
  });
});
