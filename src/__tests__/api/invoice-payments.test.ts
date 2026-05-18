/**
 * API tests — POST /api/invoices/[id]/payments
 *
 * Surface tested (high-value financial path):
 *   - Auth: 403 for non-admin, ADMIN cross-role guard against non-CLIENT invoices
 *   - Validation: amount, payment method, payment date
 *   - Overpayment: hard reject (Sprint 1 sécurité critique)
 *   - Cancelled invoice: 400 INVOICE_CANCELLED
 *   - Idempotency: replay → 409 DUPLICATE_REQUEST
 *   - Happy path: payment created, allocation triggered, SMS attempted, log written
 *
 * Strategy: mock every collaborator (auth, prisma, allocatePayments, idempotency,
 * sms, log, cache, observability). The route handler is exercised directly with
 * a synthesised Request — no real DB.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  invoiceFindUnique: vi.fn(),
  paymentCreate: vi.fn(),
  paymentFindMany: vi.fn(),
  allocatePayments: vi.fn(),
  tryAcquireIdempotency: vi.fn(),
  sendSMS: vi.fn(async () => true),
  sendAdminSMS: vi.fn(async () => true),
  logAction: vi.fn(async () => undefined),
  cacheDel: vi.fn(async () => undefined),
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    invoice: { findUnique: mocks.invoiceFindUnique },
    payment: { create: mocks.paymentCreate, findMany: mocks.paymentFindMany },
  },
}));
vi.mock('@/lib/payments', () => ({ allocatePayments: mocks.allocatePayments }));
vi.mock('@/lib/idempotency', () => ({
  tryAcquireIdempotency: mocks.tryAcquireIdempotency,
  IdempotencyKeyInvalidError: class IdempotencyKeyInvalidError extends Error {},
}));
vi.mock('@/lib/sms', () => ({
  sendSMS: mocks.sendSMS,
  sendAdminSMS: mocks.sendAdminSMS,
  formatMAD: (n: number) => `${n} MAD`,
  // sms-dedup imports normalizePhone — provide a passthrough so the
  // SmsLog dedup hash uses a deterministic canonical form in tests.
  normalizePhone: (p: string) => p,
}));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { INVOICE_PAID: 'INVOICE_PAID' },
}));
vi.mock('@/lib/cache', () => ({ cacheDel: mocks.cacheDel }));
vi.mock('@/lib/decimal', () => ({
  toNumber: (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0)),
}));
vi.mock('@/lib/observability', () => ({
  withSpan: async <T>(_n: string, _a: unknown, fn: () => Promise<T>) => fn(),
}));

import { POST } from '@/app/api/invoices/[id]/payments/route';

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/invoices/inv1/payments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: 'inv1' }) };

const baseInvoice = {
  id: 'inv1',
  invoiceNumber: 'DU-2026-0001',
  status: 'PENDING',
  amount: 1000,
  clientDisplayName: 'Mehdi B.',
  payments: [] as Array<{ amount: number }>,
  client: { name: 'Mehdi B.', email: 'm@x.com', phone: '+212600000000', isWalkIn: false, role: 'CLIENT' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } });
  mocks.tryAcquireIdempotency.mockResolvedValue({ acquired: true });
  mocks.invoiceFindUnique.mockResolvedValue({ ...baseInvoice });
  // recordPayment (Module 4-A) now does `payment.create({...,select:{id:true}})`
  // and reads `.id` off the result — default mock prevents an undefined throw
  // that would otherwise cascade as 500 + leak mockResolvedValueOnce queue
  // entries to subsequent tests.
  mocks.paymentCreate.mockResolvedValue({ id: 'pay-test' });
});

describe('POST /api/invoices/[id]/payments — auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(401);
  });

  it('rejects CLIENT role with 403', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'c1', role: 'CLIENT' } });
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(403);
  });

  it('rejects ADMIN trying to pay an ADMIN/SUPERADMIN invoice (cross-role guard)', async () => {
    mocks.invoiceFindUnique.mockResolvedValueOnce({
      ...baseInvoice,
      client: { ...baseInvoice.client, role: 'ADMIN' },
    });
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FORBIDDEN');
  });

  it('SUPERADMIN can record payment on any invoice', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: 'sa1', role: 'SUPERADMIN' } });
    mocks.invoiceFindUnique.mockResolvedValueOnce({
      ...baseInvoice,
      client: { ...baseInvoice.client, role: 'ADMIN' },
    });
    // Need to mock the second findUnique (the "return updated") too.
    mocks.invoiceFindUnique.mockResolvedValueOnce({ ...baseInvoice, items: [], payments: [] });
    mocks.paymentCreate.mockResolvedValueOnce({});
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(201);
  });
});

describe('POST /api/invoices/[id]/payments — validation', () => {
  // Since PR #168 (shared api-schemas), malformed bodies are rejected
  // by Zod with `error: 'INVALID_BODY'` + structured `issues`, BEFORE
  // reaching the recordPayment helper. The helper's specific codes
  // (INVALID_AMOUNT / INVALID_PAYMENT_METHOD) still exist for callers
  // that bypass this route but are no longer reachable through it.
  it('rejects amount = 0 with INVALID_BODY', async () => {
    const res = await POST(makeReq({ amount: 0, paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });

  it('rejects negative amount with INVALID_BODY', async () => {
    const res = await POST(makeReq({ amount: -50, paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });

  it('rejects non-numeric amount with INVALID_BODY', async () => {
    const res = await POST(makeReq({ amount: 'abc', paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });

  it('rejects unknown paymentMethod with INVALID_BODY', async () => {
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'BITCOIN' }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_BODY');
  });

  it('accepts all 4 valid paymentMethods', async () => {
    mocks.invoiceFindUnique.mockResolvedValue({ ...baseInvoice, items: [], payments: [] });
    for (const method of ['CASH', 'CARD', 'CHECK', 'TRANSFER']) {
      mocks.invoiceFindUnique.mockResolvedValueOnce({ ...baseInvoice });
      mocks.invoiceFindUnique.mockResolvedValueOnce({ ...baseInvoice, items: [], payments: [] });
      mocks.tryAcquireIdempotency.mockResolvedValueOnce({ acquired: true });
      const res = await POST(makeReq({ amount: 50, paymentMethod: method }), ctx);
      expect(res.status).toBe(201);
    }
  });

  it('rejects malformed paymentDate with INVALID_PAYMENT_DATE', async () => {
    const res = await POST(
      makeReq({ amount: 100, paymentMethod: 'CASH', paymentDate: 'tomorrow-ish' }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_PAYMENT_DATE');
  });
});

describe('POST /api/invoices/[id]/payments — overpayment guard', () => {
  it('rejects when payment would exceed invoice total (>1 cent tolerance)', async () => {
    mocks.invoiceFindUnique.mockResolvedValueOnce({
      ...baseInvoice,
      payments: [{ amount: 600 }],
    });
    const res = await POST(makeReq({ amount: 500, paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('OVERPAYMENT');
    expect(body.invoiceTotal).toBe(1000);
    expect(body.alreadyPaid).toBe(600);
    expect(body.attempted).toBe(500);
  });

  it('accepts a payment that lands exactly on the total', async () => {
    mocks.invoiceFindUnique.mockResolvedValueOnce({
      ...baseInvoice,
      payments: [{ amount: 700 }],
    });
    mocks.invoiceFindUnique.mockResolvedValueOnce({ ...baseInvoice, items: [], payments: [] });
    const res = await POST(makeReq({ amount: 300, paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(201);
  });

  it('tolerates 1 cent (Decimal rounding)', async () => {
    mocks.invoiceFindUnique.mockResolvedValueOnce({
      ...baseInvoice,
      payments: [{ amount: 999.99 }],
    });
    mocks.invoiceFindUnique.mockResolvedValueOnce({ ...baseInvoice, items: [], payments: [] });
    const res = await POST(makeReq({ amount: 0.02, paymentMethod: 'CASH' }), ctx);
    // 999.99 + 0.02 = 1000.01, exactly at tolerance — accepted
    expect(res.status).toBe(201);
  });
});

describe('POST /api/invoices/[id]/payments — invoice state', () => {
  it('rejects payment on CANCELLED invoice with 400', async () => {
    mocks.invoiceFindUnique.mockResolvedValueOnce({ ...baseInvoice, status: 'CANCELLED' });
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVOICE_CANCELLED');
  });

  it('returns 404 when invoice does not exist', async () => {
    mocks.invoiceFindUnique.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/invoices/[id]/payments — idempotency', () => {
  it('returns 409 DUPLICATE_REQUEST on idempotency replay', async () => {
    mocks.tryAcquireIdempotency.mockResolvedValueOnce({ acquired: false });
    const res = await POST(
      makeReq({ amount: 100, paymentMethod: 'CASH' }, { 'idempotency-key': 'test-key-1234' }),
      ctx,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('DUPLICATE_REQUEST');
    // Critically: no payment should have been created, no SMS sent
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
    expect(mocks.allocatePayments).not.toHaveBeenCalled();
  });
});

describe('POST /api/invoices/[id]/payments — happy path', () => {
  beforeEach(() => {
    mocks.invoiceFindUnique
      .mockResolvedValueOnce(baseInvoice) // initial fetch
      .mockResolvedValueOnce({ ...baseInvoice, items: [], payments: [{ amount: 100 }] }); // post-update fetch
  });

  it('creates the payment + triggers allocation + invalidates revenue cache', async () => {
    const res = await POST(
      makeReq({
        amount: 100,
        paymentMethod: 'CASH',
        paymentDate: '2026-05-13T10:00:00Z',
        notes: '  Test note  ',
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(mocks.paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          invoiceId: 'inv1',
          amount: 100,
          paymentMethod: 'CASH',
          paymentDate: expect.any(Date),
          notes: 'Test note', // trimmed
        },
      }),
    );
    expect(mocks.allocatePayments).toHaveBeenCalledWith('inv1');
    expect(mocks.cacheDel).toHaveBeenCalledWith('revenue:2026:5');
  });

  it('attempts client SMS confirmation (non-walk-in)', async () => {
    await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), ctx);
    expect(mocks.sendSMS).toHaveBeenCalledWith(
      '+212600000000',
      expect.stringContaining('100 MAD'),
    );
    expect(mocks.sendAdminSMS).toHaveBeenCalled();
  });

  it('skips client SMS when client.isWalkIn = true', async () => {
    // mockReset (not clearAllMocks) wipes the queued mockResolvedValueOnce
    // entries from the parent beforeEach. We re-arm everything from scratch.
    mocks.invoiceFindUnique.mockReset();
    mocks.sendSMS.mockReset();
    mocks.sendAdminSMS.mockReset();
    mocks.invoiceFindUnique
      .mockResolvedValueOnce({ ...baseInvoice, client: { ...baseInvoice.client, isWalkIn: true } })
      .mockResolvedValueOnce({ ...baseInvoice, items: [], payments: [] });
    await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), ctx);
    expect(mocks.sendSMS).not.toHaveBeenCalled();
    expect(mocks.sendAdminSMS).toHaveBeenCalled(); // admin SMS always
  });

  it('writes an audit log entry', async () => {
    await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), ctx);
    expect(mocks.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INVOICE_PAID',
        entityType: 'Invoice',
        entityId: 'inv1',
        details: expect.objectContaining({ amount: 100, paymentMethod: 'CASH' }),
      }),
    );
  });

  it('SMS failure does NOT fail the payment recording (additive)', async () => {
    mocks.sendSMS.mockRejectedValueOnce(new Error('SMS gateway down'));
    const res = await POST(makeReq({ amount: 100, paymentMethod: 'CASH' }), ctx);
    expect(res.status).toBe(201);
  });
});
